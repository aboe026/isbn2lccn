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

| Name              | Required | Default     | Description                                                          | Example(s)                                                  |
| ----------------- | -------- | ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `INPUT_CSV`       | Yes      |             | Full path to CSV file containing ISBN information                    | `C:\Users\nemo\Documents\isbns.csv`, `/home/nemo/isbns.csv` |
| `OUTPUT_CSV`      | No       | `INPUT_CSV` | Full path to CSV file to output LCCN information                     | `C:\Users\nemo\Documents\isbns.csv`, `/home/nemo/isbns.csv` |
| `PAGE_TIMEOUT_MS` | Yes      | 60000       | The maximum number of milliseconds to wait for browser pages to load | `30000`, `90000`                                            |

**Note** The format of the `INPUT_CSV` should have the following columns:

| Name      | Required | Description                                                       | Example(s)                      |
| --------- | -------- | ----------------------------------------------------------------- | ------------------------------- |
| Name      | Yes      | The title of the book                                             | `The Lord of the Rings`         |
| Text      | Yes      | The ISBN of the book                                              | `9780618343997`                 |
| Date      | No       | The date the book ISBN was collected                              | `1/14/2022`                     |
| Time      | No       | The time the book ISBN was collected                              | `10:55:37`                      |
| ISBN      | No       | Duplicate of the `Text` field                                     | `9780618343997`                 |
| Created   | No       | Combination of the `Date` and `Time` columns                      | `2022-01-14T18:55:37.000Z`      |
| Title     | No       | The name of the book (may be duplicate of the `Name` field)       | `The Lord of the Rings`         |
| Author    | No       | The author of the book                                            | `J.R.R. Tolkien`                |
| Published | No       | The date the book was published                                   | `2003-01-01T00:00:00.000Z`      |
| LCCN      | No       | The LCCN of the book                                              | `54036398`, `N/A`               |
| Link      | No       | The permalink to the book page in the Library of Congress website | `https://lccn.loc.gov/54036398` |
| Verified  | No       | Whether or not the ISBN on the LCCN matches the ISBN in the CSV   | `yes`, `no`                     |

If the LCCN cannot be found it will have the text `N/A` in the `LCCN` column
