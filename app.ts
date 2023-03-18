import { Application, Router, RouterContext } from './deps.ts';
import { logDebug, logError, logInfo, readVersion, receiveJsonOrLogError, startWireApp } from './wire.ts';

const env = Deno.env.toObject();

let romanBase = env.ROMAN_URL ?? 'https://roman.integrations.zinfra.io/';
romanBase = romanBase.endsWith('/') ? romanBase : `${romanBase}/`;
const romanBroadcast = `${romanBase}broadcast`;
const authConfigurationPath = env.AUTH_CONFIGURATION_PATH;

const app = new Application();
const router = new Router();

router.post('/roman', async (ctx: RouterContext) => {
  const [, authorizationToken] = ctx.request.headers.get('authorization')?.split(' ') ?? [];
  ctx.assert(authorizationToken, 401, 'Authorization required.');

  const { admins, appKey } = await getConfigurationForAuth(authorizationToken);
  ctx.assert(admins && appKey, 404, 'No Roman auth found.');

  const body = await ctx.request.body({ type: 'json' }).value;
  const { type, userId, messageId } = body;
  logInfo(`Handling message type ${type}.`, { userId, messageId });
  ctx.response.body = await determineHandle(type)({ body, isUserAdmin: admins.includes(userId), appKey });
  ctx.response.status = 200;
});

interface HandlerDto {
  body: any
  isUserAdmin: boolean
  appKey: string
}

// TODO this will be replaced by the Roman's properties
const broadcastIdDatabase: Record<string, string> = {};

const helpMessage = '' +
  '`/broadcast message` to broadcast the message to users and ring their phones\n' +
  '`/stats` metrics of the last broadcast\n' +
  '`/version` to print current application version.';

const handleNewText = async ({ body, isUserAdmin, appKey }: HandlerDto) => {
  let maybeMessage;
  const { text, userId, messageId } = body;
  const userText = text?.data ?? '';
  // admin commands
  if (isUserAdmin) {
    if (userText.startsWith('/help')) {
      maybeMessage = helpMessage;
    } else if (userText.startsWith('/broadcast')) {
      logInfo('Executing text broadcast. Sending text.', { userId, messageId });

      // send this asynchronously and do not block
      // 10 chars removes "/broadcast "
      const message = wireText(userText.substring(10));
      asyncBroadcast(message, appKey, userId, messageId)
      .then((broadcastId) => logDebug(`Broadcast ${broadcastId} executed.`, { broadcastId, userId, messageId }));
      maybeMessage = 'Broadcast queued for execution. Use /stats to see the broadcast metrics.';
    } else if (userText.startsWith('/stats')) {
      maybeMessage = await getBroadcastStats(appKey, broadcastIdDatabase[userId]);
    }
  }
  // this can be from user as well as admin
  if (userText.startsWith('/version')) {
    maybeMessage = await readVersion();
  }

  logDebug(`Responding with: ${maybeMessage ? `"${maybeMessage}"` : 'no message.'}`, { userId, messageId });
  return maybeMessage ? wireText(maybeMessage) : undefined;
};

const handleCall = async ({ body }: HandlerDto) => {
  const { userId, messageId, call } = body;
  // drop the call if somebody responded yes and joined it
  const maybeMessage = call?.resp == true ? wireCallDrop() : undefined;
  logDebug(`Handling a call: ${maybeMessage ? 'dropping' : 'ignoring'}.`, { userId, messageId });
  return maybeMessage;
};

const handleAsset = async ({ body, isUserAdmin, appKey }: HandlerDto) => {
  if (!isUserAdmin || !body.attachment) {
    return undefined;
  }
  const { userId, messageId } = body;
  const message = { type: 'attachment', attachment: body.attachment };
  asyncBroadcast(message, appKey, userId, messageId)
  .then((broadcastId) => logDebug(`Asset broadcast ${broadcastId} executed.`, { broadcastId, userId, messageId }));
  return wireText('Asset broadcast queued for execution. Use /stats to see the metrics.');
};

// fancy switch case for generic request handling
const determineHandle = (type: string) => handles[type] ?? ((_) => undefined);
const handles: Record<string, ((handler: HandlerDto) => any) | undefined> = {
  'conversation.init': ({ isUserAdmin }) => wireText(isUserAdmin ? helpMessage : 'Subscription confirmed.'),
  'conversation.new_text': handleNewText,
  'conversation.call': handleCall,
  'conversation.asset.data': handleAsset
};

const getBroadcastStats = async (appKey: string, broadcastId: string | undefined = undefined) => {
  logDebug(`Retrieving broadcast stats for broadcast ${broadcastId}.`, { broadcastId });
  const url = broadcastId ? `${romanBroadcast}?id=${broadcastId}` : romanBroadcast;
  const request = await fetch(url, { method: 'GET', headers: { 'app-key': appKey } }).then(receiveJsonOrLogError);
  return convertStats(request);
};

const convertStats = ({ report }: { report: { type: string, count: number }[] }) =>
  report
  .map(({ type, count }) => `${type}: ${count}`)
  .join('\n');

const getConfigurationForAuth = async (authToken: string) => {
  const authConfiguration = await Deno.readTextFile(authConfigurationPath).then(text => JSON.parse(text));
  return authConfiguration[authToken] ?? {};
};

// wire messages definition
type WireMessage = any // just a type alias, it's an object
const wireText = (message: string) => ({ type: 'text', text: { data: message } });
const wireCall = (type: 'GROUPSTART' | 'GROUPLEAVE') => ({ type: 'call', call: { version: '3.0', type, resp: false, sessid: '' } });
const wireCallStart = () => wireCall('GROUPSTART');
const wireCallDrop = () => wireCall('GROUPLEAVE');

const asyncBroadcast = async (message: WireMessage, appKey: string, userId: string, messageId: string) => {
  try {
    const { broadcastId } = await broadcastToWire(message, appKey);
    logDebug(
      `Broadcast sent, received broadcast id: ${broadcastId}. Storing for user ${userId}`,
      { broadcastId, userId, messageId }
    );
    broadcastIdDatabase[userId] = broadcastId;
    // ring the phones
//     await broadcastToWire(wireCallStart(), appKey);
//     logDebug(
//       `Call started for broadcast ${broadcastIdDatabase[userId]}`,
//       { userId, broadcastId: broadcastIdDatabase[userId], messageId });
    return broadcastId;
  } catch (e) {
    logError(`An exception during broadcast with message id: ${messageId}`, e);
  }
};

// send data to Roman
const broadcastToWire = async (wireMessage: WireMessage, appKey: string) => fetch(
  romanBroadcast,
  {
    method: 'POST',
    headers: { 'app-key': appKey, 'content-type': 'application/json' },
    body: JSON.stringify(wireMessage)
  }
).then(receiveJsonOrLogError);

// and finally start the app
await startWireApp(app, router);
