# metadaemon

Metadata service.


## Installation

To install the [Python](https://www.python.org/) dependencies:

```sh
pip install -r app/requirements.txt
```


## Local development

To start the app's local dev server:

```sh
npm start
```


## Deployment

To deploy the app to production:

```sh
gcloud app deploy app.yaml
```

To view the app in production from your browser:

```sh
gcloud app browse
```

To read the app's logs:

```sh
gcloud app logs read -s default
```


## License

[MIT](LICENSE.md)
