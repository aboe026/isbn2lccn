# isbn2lccn

Convert list of books by ISBN to their LCCN

## Requirements

- [NodeJS](https://nodejs.org)

* [Chrome](https://www.google.com/chrome/)

## Install

To install dependencies, run

```sh
npm install
```

## Drivers

The execution of this project requires [native webdrivers](https://github.com/SeleniumHQ/selenium/blob/trunk/javascript/node/selenium-webdriver/README.md#installation) on your machine for Google Chrome in order to work with Selenium.

Please download your appropriate [Chrome webdriver](http://chromedriver.storage.googleapis.com/index.html) and place it in the `drivers` directory of this repository.

## Run

To execute the script, run

```sh
npm start
```

The script takes the following environment variables:

| Name          | Required | Default | Description                                                           | Example(s)                                                  |
| ------------- | -------- | ------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `INPUT_CSV`   | Yes      |         | Full path to CSV file containing ISBN information                     | `C:\Users\nemo\Documents\isbns.csv`, `/home/nemo/isbns.csv` |
| `VERIFY_ISBN` | No       | false   | Whether or not to check matched LCCN has matching ISBN on LOC website | `true`, `false`                                             |
