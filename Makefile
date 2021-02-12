run:
	deno run --allow-net --allow-env app.ts

docker-build:
	docker build -t lukaswire/echo-bot-roman-js .