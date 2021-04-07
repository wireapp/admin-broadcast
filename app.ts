import { Application, isHttpError, Router, RouterContext } from 'https://deno.land/x/oak@v6.5.0/mod.ts';

const env = Deno.env.toObject();

const romanBroadcast = env.ROMAN_BROADCAST ?? 'https://roman.integrations.zinfra.io/broadcast';
const authConfigurationPath = env.AUTH_CONFIGURATION_PATH;

const app = new Application();
const router = new Router();

router.post('/roman', async (ctx: RouterContext) => {
  const [, authorizationToken] = ctx.request.headers.get('authorization')?.split(' ') ?? [];
  ctx.assert(authorizationToken, 401, 'Authorization required.');

  const { admins, appKey } = await getConfigurationForAuth(authorizationToken);
  ctx.assert(admins && appKey, 404, 'No Roman auth found.');

  const body = await ctx.request.body({ type: 'json' }).value;
  const { type, userId } = body;
  ctx.response.body = determineHandle(type)({ body, isUserAdmin: admins.includes(userId), appKey });
  ctx.response.status = 200;
});

interface HandlerDto {
  body: any
  isUserAdmin: boolean
  appKey: string
}

const helpMessage = '' +
  '`/broadcast message` to broadcast the message to users and ring their phones\n' +
  '`/stats` for stats of the last broadcast\n' +
  '`/version` to print current application version.';

const handleNewText = async ({ body, isUserAdmin, appKey }: HandlerDto) => {
  let maybeMessage;
  const { text } = body;
  // admin commands
  if (isUserAdmin) {
    if (text.startsWith('/help')) {
      maybeMessage = helpMessage;
    } else if (text.startsWith('/broadcast')) {
      // 10 chars removes "/broadcast "
      maybeMessage = await broadcastTextToWire(text.substring(10), appKey).then(convertStats);
      // ring the phones
      await broadcastMessageToWire(wireCallStart(), appKey).catch((e) => console.log(e));
    } else if (text.startsWith('/stats')) {
      maybeMessage = await getBroadcastStats(appKey).catch(e => console.log(e)).then(convertStats);
    }
  }
  // this can be from user as well as admin
  if (text.startsWith('/version')) {
    maybeMessage = await readVersion();
  }

  return maybeMessage ? wireText(maybeMessage) : undefined;
};

const handleCall = async ({ body }: HandlerDto) => {
  // drop the call if somebody responded yes and joined it
  if (body?.call?.resp == true) {
    return wireCallDrop();
  }
};

const determineHandle = (type: string) => handles[type] ?? (_ => undefined);
const handles: Record<string, ((handler: HandlerDto) => any) | undefined> = {
  'conversation.init': ({ isUserAdmin }) => wireText(isUserAdmin ? helpMessage : 'Subscription confirmed.'),
  'conversation.new_text': handleNewText,
  'conversation.call': handleCall
};

const getBroadcastStats = async (appKey: string) =>
  fetch(`${romanBroadcast}`, { method: 'GET', headers: { 'app-key': appKey } }).then(r => r.json());

const convertStats = ({ report }: { report: { type: string, count: number }[] }) =>
  report
  .map(({ type, count }) => `${type}: ${count}`)
  .join('\n');

const getConfigurationForAuth = async (authToken: string) => {
  const authConfiguration = await Deno.readTextFile(authConfigurationPath).then(text => JSON.parse(text));
  return authConfiguration[authToken] ?? {};
};

// wire messages definition
const wireText = (message: string) => ({ type: 'text', text: { data: message } });
const wireCall = (type: 'GROUPSTART' | 'GROUPLEAVE') => ({
  type: 'conversation.call',
  call: { version: '3.0', type, resp: false, sessid: '' }
});
const wireCallStart = () => wireCall('GROUPSTART');
const wireCallDrop = () => wireCall('GROUPLEAVE');
// send data to Roman
const broadcastTextToWire = async (message: string, appKey: string) => broadcastMessageToWire(wireText(message), appKey);
const broadcastMessageToWire = async (wireMessage: { type: string }, appKey: string) =>
  fetch(
    romanBroadcast,
    {
      method: 'POST',
      headers: { 'app-key': appKey, 'content-type': 'application/json' },
      body: JSON.stringify(wireMessage)
    }
  ).then(r => r.json());

/* ----------------- WIRE Common ----------------- */
// k8s indication the service is running
router.get('/status', ({ response }) => {
  response.status = 200;
});
// technical endpoint to display the version
router.get('/version', async ({ response }) => {
  response.body = { version: readVersion() };
});

const readVersion = async () => {
  let version: string | undefined;
  const releaseFilePath = Deno.env.get('RELEASE_FILE_PATH');
  if (releaseFilePath) {
    try {
      version = await Deno.readTextFile(releaseFilePath).then(text => text.trim());
    } catch {
    }
  }
  return version ?? 'development';
};
// log all failures that were not handled
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (!isHttpError(err)) {
      console.log(err);
    }
    throw err;
  }
});
/* //--------------- WIRE Common ----------------- */

app.use(router.routes());
app.use(router.allowedMethods());

app.addEventListener('listen', () => console.log('Server up and running on localhost:8080'));
await app.listen({ port: 8080 });
