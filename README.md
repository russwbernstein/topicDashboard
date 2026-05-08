# Topic Readiness Dashboard POC

Local proof of concept for evaluating topic readiness using:

- Tagomatic topic metadata
- TSI coverage and momentum scores
- Hot Topic Radar matches
- Entity Management access controls

## Run Locally

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5176`.

## Share Through Ngrok

```bash
ngrok http --url=topicdash.ngrok.app 5176
```
