import { Application, Router, RouterContext } from 'https://deno.land/x/oak@v6.5.0/mod.ts';

const env = Deno.env.toObject();

const romanBroadcast = env.ROMAN_BROADCAST ?? 'https://roman.integrations.zinfra.io/broadcast';
const romanServiceAuth = env.ROMAN_SERVICE_AUTH;
const romanAppKey = env.ROMAN_APP_KEY;
const adminUserId = env.ADMIN_ID;

const app = new Application();
const router = new Router();

router.post('/roman', async (ctx: RouterContext) => {
  const authorized = ctx.request.headers.get('authorization')?.split(' ')?.find(x => x === romanServiceAuth);
  ctx.assert(authorized, 401, 'Authorization required.');

  const { type, text, userId } = await ctx.request.body({ type: 'json' }).value;

  if (userId === adminUserId) {
    if (
      type === 'conversation.init' ||
      (type === 'conversation.new_text' && text.startsWith('/help'))
    ) {
      ctx.response.body = wireMessage('Write `/broadcast message` to broadcast the message to users.');
    } else if (
      type === 'conversation.new_text'
      && text.startsWith('/broadcast')
    ) {
      await broadcastTextToWire(text.substring(10));
    }
  } else if (
    type === 'conversation.init'
  ) {
    ctx.response.body = wireMessage('Thanks for subscribing to awesome broadcast.');
  }
  ctx.response.status = 200;
});

const wireMessage = (message: string) => ({ type: 'text', text: { data: message } });

const broadcastTextToWire = async (message: string) => {
  const response = await fetch(
    romanBroadcast,
    {
      method: 'POST',
      headers: { 'app-key': romanAppKey, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'text', text: { data: message } })
    }
  );
  console.log(`Received response: ${await response.json()}`);
  return response.status;
};


app.use(router.routes());
app.use(router.allowedMethods());

app.addEventListener('listen', () => console.log('Server up and running on localhost:8080'));
await app.listen({ port: 8080 });