import { Application, isHttpError, Router, RouterContext } from './deps.ts';

/**
 * Initializes application and starts it up.
 */
export const startWireApp = async (app: Application, router: Router) => {
  // k8s indication the service is running
  router.get('/status', ({ response }: RouterContext) => {
    response.status = 200;
  });
  // technical endpoint to display the version
  router.get('/version', async ({ response }: RouterContext) => {
    response.body = { version: await readVersion() };
  });
  // log all failures that were not handled
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (e) {
      if (!isHttpError(e)) {
        logError('Unhandled exception in the application!', e);
      }
      throw e;
    }
  });
  // request logging and measuring time
  app.use(async (ctx, next) => {
    // ignore /status calls
    if (ctx.request.url.pathname === '/status') {
      return await next();
    }

    const start = Date.now();
    let err;
    try {
      await next();
    } catch (e) {
      err = e;
    }
    const durationMls = Date.now() - start;
    log(
      'INFO',
      `Request to ${ctx.request.url} took ${durationMls}mls with status code ${ctx.response.status}.`,
      { url: ctx.request.url, durationMls, statusCode: ctx.response.status, ip: ctx.request.ip },
      'HTTP'
    );

    if (err) {
      throw err;
    }
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  const port = parseInt(Deno.env.get('PORT') ?? '8080');
  const version = await readVersion();
  app.addEventListener('listen', () => logInfo(`Server up and running on localhost:${port}`, { version }));
  await app.listen({ port });
};

/**
 * Returns version of the code.
 */
export const readVersion = async () => {
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

/**
 * Returns JSON from body if request was successful, otherwise logs the
 * request and throws Error.
 */
export const receiveJsonOrLogError = async (response: Response) => {
  if (response.ok && response.body) {
    return await response.json();
  }

  // try to parse it like json
  let body = await response.text();
  try {
    body = JSON.parse(body) ?? body;
  } catch (ignored) {
  }

  logWarn(`Request was not successful!`,
    { httpUrl: response.url, httpStatus: response.status, httpBody: body }
  );
  // TODO maybe return undefined/null
  throw new Error(`Request to ${response.url} was not successful.`);
};

/**
 * Logs message to JSON.
 */
export const log = (
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  message: string,
  otherProps: unknown = {},
  type: 'LOG' | 'HTTP' = 'LOG'
) => {
  let logMessage: Record<string, any> = {
    '@timestamp': new Date().toISOString(),
    message,
    level,
    type
  };

  if (otherProps instanceof Error) {
    logMessage['exception'] = errorToObject(otherProps);
  } else if (otherProps && typeof otherProps === 'object') {
    logMessage = { ...logMessage, ...otherProps };
  } else if (typeof otherProps === 'string' || typeof otherProps === 'number') {
    logMessage['otherProps'] = otherProps;
  }

  console.log(JSON.stringify(logMessage));
};

const errorToObject = (error: Error) => {
  const obj: Record<string, any> = {};

  Object.getOwnPropertyNames(error).forEach(function(propName) {
    // @ts-ignore we can actually do this
    obj[propName] = error[propName];
  });
  return obj;
};

export const logDebug = (
  message: string,
  otherProps: unknown = {}
) => log('DEBUG', message, otherProps, 'LOG');

export const logInfo = (
  message: string,
  otherProps: unknown = {}
) => log('INFO', message, otherProps, 'LOG');

export const logWarn = (
  message: string,
  otherProps: unknown = {}
) => log('WARN', message, otherProps, 'LOG');

export const logError = (
  message: string,
  otherProps: unknown = {}
) => log('ERROR', message, otherProps, 'LOG');
