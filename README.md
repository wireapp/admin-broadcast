# Admin Broadcast Bot

This bot allows administrator to broadcast messages on Wire - the administrator writes the message to this bot and the bot broadcast that message to every conversation the bot is in.

## Development

The bot is based on the JavaScript runtime [Deno](https://deno.land/) and [Oak](https://github.com/oakserver/oak) middleware.

## Configuration

The bot uses few environmental variables for its configuration, for complete list see first lines of the [code](app.ts).

```bash
ROMAN_URL                 # Domain where the Roman is running. By default Wire Staging https://roman.integrations.zinfra.io/ 
AUTH_CONFIGURATION_PATH   # Path to a file with admin configurations.
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
