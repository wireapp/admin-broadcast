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

  // admin commands
  if (isUserAdmin) {
    if (text.startsWith('/help')) {
      maybeMessage = helpMessage;
    } else if (text.startsWith('/broadcast')) {
      logInfo('Executing text broadcast. Sending text.', { userId, messageId });

      // send this asynchronously and do not block
      // 10 chars removes "/broadcast "
      const message = wireText(text.substring(10));
      // noinspection ES6MissingAwait, we don't need to wait for this
      asyncBroadcast(message, appKey, userId, messageId);
      maybeMessage = 'Broadcast queued for execution. Use /stats to see the broadcast metrics.';
    } else if (text.startsWith('/stats')) {
      maybeMessage = await getBroadcastStats(appKey, broadcastIdDatabase[userId]);
    }
  }
  // this can be from user as well as admin
  if (text.startsWith('/version')) {
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

const handleAudio = async ({ body, isUserAdmin, appKey }: HandlerDto) => {
  if (!isUserAdmin) {
    return undefined;
  }

  const { attachment, mimeType, duration, text, levels, userId, messageId } = body;
  logDebug(`Handling audio broadcast - creating message.`, { userId, messageId });
  const message = wireAudio(attachment, text, mimeType, duration, levels);

  logDebug(`Broadcasting the audio`, { userId, messageId });

  // noinspection ES6MissingAwait, we don't need to wait for this
  asyncBroadcast(message, appKey, userId, messageId);

  return wireText('Audio broadcast queued for execution. Use /stats to see the metrics.');
};

const asyncBroadcast = async (message: WireMessage, appKey: string, userId: string, messageId: string) => {
  try {
    const { broadcastId } = await broadcastMessageToWire(message, appKey);
    logDebug(
      `Text broadcast sent, received broadcast id: ${broadcastId}. Storing for user ${userId}`,
      { broadcastId, userId, messageId }
    );
    broadcastIdDatabase[userId] = broadcastId;
    // ring the phones
    await broadcastMessageToWire(wireCallStart(), appKey);
    logDebug(
      `Call started for broadcast ${broadcastIdDatabase[userId]}`,
      { userId, broadcastId: broadcastIdDatabase[userId], messageId });
  } catch (e) {
    logError(`An exception during broadcast with message id: ${messageId}`, e);
  }
};

// fancy switch case for generic request handling
const determineHandle = (type: string) => handles[type] ?? (_ => undefined);
const handles: Record<string, ((handler: HandlerDto) => any) | undefined> = {
  'conversation.init': ({ isUserAdmin }) => wireText(isUserAdmin ? helpMessage : 'Subscription confirmed.'),
  'conversation.new_text': handleNewText,
  'conversation.call': handleCall,
  'conversation.audio.new': handleAudio
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
const wireText = (message: string) => ({ type: 'text', text: { data: message } });
const wireAudio = (data: string, filename: string, mimeType: string, duration: number, levels: []) => (
  { type: 'attachment', attachment: { data, filename, mimeType, duration, levels } });
const wireCall = (type: 'GROUPSTART' | 'GROUPLEAVE') => ({ type: 'call', call: { version: '3.0', type, resp: false, sessid: '' } });
const wireCallStart = () => wireCall('GROUPSTART');
const wireCallDrop = () => wireCall('GROUPLEAVE');

interface WireMessage {
  type: string
}

// send data to Roman
const broadcastMessageToWire = async (wireMessage: WireMessage, appKey: string) =>
  fetch(
    romanBroadcast,
    {
      method: 'POST',
      headers: { 'app-key': appKey, 'content-type': 'application/json' },
      body: JSON.stringify(wireMessage)
    }
  ).then(receiveJsonOrLogError);


// and finally start the app
await startWireApp(app, router);
