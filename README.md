# Admin Broadcast Bot

This bot allows administrator to broadcast messages on Wire - the administrator writes the message to this bot and the bot broadcast that message to every conversation the bot is in.

## Development

The bot is based on the JavaScript runtime [Deno](https://deno.land/) and [Oak](https://github.com/oakserver/oak) middleware.

## Configuration

The bot uses few environmental variables for its configuration, the usage is in the [code](app.ts).

```bash
ROMAN_URL                 # Domain where the Roman is running. By default Wire Staging https://roman.integrations.zinfra.io/ 
AUTH_CONFIGURATION_PATH   # Path to a file with admin configurations.
PORT                      # Port on where does the app run. By default 8080.
```

### Auth configuration

The JSON is necessary for bot to be able to authenticate with Roman and allow only certain users to broadcast the messages. The structure is following.

```json
{
  "service_authentication from Roman": {
    "admins": [
      "list of user IDs - these users can broadcast"
    ],
    "appKey": "app_key from Roman"
  }
}
```

As an example - if you received following JSON from Roman during bot onboarding process.

```json
{
  "service": "My Broadcast Service",
  "service_code": "4e38c13f-7975-4cf4-8745-290ecdd0c25c:199b8704-0edb-4c0d-a8a0-94260fc3434d",
  "service_authentication": "PeCVf7c_5CxhBlNPsuABqaiC",
  "app_key": "eyJhbGcasdOiJIUzM4NCJ9..kjshdfi3MiOiJodHRwczovL3dpcmUuYakdjfhsdjkfhC00NTZkLWFjZDktYzAxZjE1MDExY2MyIn0.dixLJQGDJTS9yRfaslkdhalsd41GaSxgo4ObmzhYXANfXjmDzhmNKkJxqhBco"
}
```

Say you want to enable broadcasts for users with IDs `62253374-cdda-4901-a710-48c65a5a13c7` and `8538d838-c4b4-4781-a97f-d3b18f0d81ef`. Then your configuration JSON will be following:

```json
{
  "PeCVf7c_5CxhBlNPsuABqaiC": {
    "admins": [
      "62253374-cdda-4901-a710-48c65a5a13c7",
      "8538d838-c4b4-4781-a97f-d3b18f0d81ef"
    ],
    "appKey": "eyJhbGcasdOiJIUzM4NCJ9..kjshdfi3MiOiJodHRwczovL3dpcmUuYakdjfhsdjkfhC00NTZkLWFjZDktYzAxZjE1MDExY2MyIn0.dixLJQGDJTS9yRfaslkdhalsd41GaSxgo4ObmzhYXANfXjmDzhmNKkJxqhBco"
  }
}
```

## Deployment

In order to run the Admin Broadcast Bot you need following:

- a public IP address / host name, where Roman can reach the bot
- a machine where you can run the bot

There are basically two options, how to run the bot - either on bare metal, or in the Docker container.

### On bare metal

For this to work, you need to install Deno runtime - [see official docs](https://deno.land/manual/getting_started/installation).

1. Clone this git repository
2. Create auth configuration JSON as described in the previous chapter - say in the same git folder with name `config.json`

```bash
touch config.json
# and fill it with required values   
```

3. Set necessary environment variables

```bash
export AUTH_CONFIGURATION_PATH="${PWD}/config.json"
export ROMAN_URL="https://proxy.services.wire.com/" # or your own Roman instance
export PORT="8080"
```

4. Execute the application

```bash
deno run --allow-net --allow-env --allow-read app.ts
```

### Docker Container

1. Clone this git repository
2. Create auth configuration JSON as described in the previous chapter - say in the same git folder with name `config.json`

```bash
touch config.json
# and fill it with required values   
```

3. Build the docker image

```bash
docker build -t admin-broadcast .
```

4. Run the container

```bash
docker run \ 
-v "${PWD}/config.json:/app/config.json" \  
-e AUTH_CONFIGURATION_PATH='/app/config.json' \  
-e ROMAN_URL='https://proxy.services.wire.com/' \  # or your own Roman instance
-e PORT='8080' \ 
-p 8080:8080 \ 
--name admin-broadcast --rm admin-broadcast
```

### Bot Registration

In order to use the bot in Wire you need to complete one more additional step - to register the Bot in the Roman and Wire. The tutorial how to do that
is [here](https://github.com/wireapp/roman/blob/staging/docs/onboarding.md) - please read [Roman README.md](https://github.com/wireapp/roman/) as well.
