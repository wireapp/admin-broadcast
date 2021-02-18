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

  const { type, text, userId }: { type: string, text: string, userId: string }
    = await ctx.request.body({ type: 'json' }).value;
  ctx.response.status = 200;
  let maybeMessage;
  if (admins.includes(userId)) {
    const helpMessage = 'Write `/broadcast message` to broadcast the message to users. Or /stats for stats of the last broadcast.';
    switch (type) {
      case 'conversation.init':
        maybeMessage = helpMessage;
        break;
      case 'conversation.new_text':
        if (text.startsWith('/help')) {
          maybeMessage = helpMessage;
        } else if (text.startsWith('/broadcast')) {
          maybeMessage = await broadcastTextToWire(text.substring(10), appKey).then(convertStats);
        } else if (text.startsWith('/stats')) {
          maybeMessage = await getBroadcastStats(appKey).then(convertStats);
        }
        break;
    }
  } else if (type === 'conversation.init') {
    maybeMessage = 'Thanks for subscribing to awesome broadcast.';
  }

  if (maybeMessage) {
    ctx.response.body = wireMessage(maybeMessage);
  }
});

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

const wireMessage = (message: string) => ({ type: 'text', text: { data: message } });

const broadcastTextToWire = async (message: string, appKey: string) => {
  const response = await fetch(
    romanBroadcast,
    {
      method: 'POST',
      headers: { 'app-key': appKey, 'content-type': 'application/json' },
      body: JSON.stringify(wireMessage(message))
    }
  );
  return response.json();
};

/* ----------------- WIRE Common ----------------- */
// k8s indication the service is running
router.get('/status', ({ response }) => {
  response.status = 200;
});
// technical endpoint to display the version
router.get('/version', async ({ response }) => {
  let version: string | undefined;
  const releaseFilePath = Deno.env.get('RELEASE_FILE_PATH');
  if (releaseFilePath) {
    try {
      version = await Deno.readTextFile(releaseFilePath).then(text => text.trim());
    } catch {
    }
  }
  response.body = { version: version ?? 'development' };
});
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