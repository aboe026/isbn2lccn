import { config } from 'dotenv'
config()

import CSV from './csv'
import fetch from 'node-fetch'
import fs from 'fs-extra'
import path from 'path'
import { platform } from 'os'
import { Builder, By, until, Locator, WebDriver, WebElement } from 'selenium-webdriver'

import env from './env'
;(async () => {
  try {
    await validateEnv()
    const books = await getBooks(env.INPUT_CSV)
    await addAuthorAndDate(books)
    addWebDriversToPath()
    await addLccns(books)
  } catch (err: any) {
    console.error(err)
    process.exit(1)
  }
})()

async function validateEnv(): Promise<void> {
  console.log(`INPUT_CSV: '${env.INPUT_CSV}'`)
  if (!(await fs.pathExists(env.INPUT_CSV))) {
    throw Error(`File '${env.INPUT_CSV}' specified by 'INPUT_CSV' environment variable does not exist`)
  }
}

async function getBooks(file: string): Promise<Book[]> {
  const records = await CSV.parse(file)
  return records.map((record) => {
    if (record.Published) {
      record.Published = new Date(record.Published)
    }
    if (!record.ISBN) {
      record.ISBN = record.Text
    }
    if (!record.Created && record.Date && record.Time) {
      record.Created = new Date(`${record.Date} ${record.Time}`).toISOString()
    }
    return record
  })
}

async function addAuthorAndDate(books: Book[]): Promise<void> {
  for (const book of books) {
    if (!book.Title || !book.Published) {
      console.log(`Getting title and author of '${book.ISBN}'...`)
      const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${book.ISBN}&format=json&jscmd=data`)
      const text = await response.text()
      let json
      try {
        json = JSON.parse(text)
      } catch (err) {
        throw Error(`Could not parse ISBN '${book.ISBN}' response of '${text}' as JSON: ${err}`)
      }

      if (!book.Title) {
        let title: string = json[`ISBN:${book.ISBN}`].title
        if (title.endsWith('.')) {
          title = title.substring(0, title.length - 1)
        }
        book.Title = title
      }

      if (!book.Author) {
        const author = json[`ISBN:${book.ISBN}`].authors ? json[`ISBN:${book.ISBN}`].authors[0].name : undefined
        if (author) {
          book.Author = author
        }
      }

      if (!book.Published) {
        book.Published = new Date(json[`ISBN:${book.ISBN}`].publish_date).toISOString()
      }
    }
    await CSV.write(books, env.INPUT_CSV)
  }
}

function addWebDriversToPath() {
  const driverDir = path.join(__dirname, '../drivers')
  const pathSeparator = platform() === 'win32' ? ';' : ':'
  process.env.PATH = `${driverDir}${pathSeparator}${process.env.path}`
}

async function addLccns(books: Book[]): Promise<void> {
  const driver = await new Builder().forBrowser('chrome').build()
  try {
    for (const book of books) {
      if (!book.LCCN) {
        book.LCCN = await getLccn(driver, book, book.Title || '')
        if (book.LCCN === 'N/A' && book.Name !== book.Title) {
          book.LCCN = await getLccn(driver, book, book.Name)
        }
        await CSV.write(books, env.INPUT_CSV)
      }
    }
  } catch (err) {
    const image = await driver.takeScreenshot()
    const screenshotsDir = path.join(__dirname, '../screenshots')
    await fs.ensureDir(screenshotsDir)
    const fileName = path.join(screenshotsDir, `${new Date().toISOString().replace(/:|\./g, '-')}.png`)
    console.log(`Saving screenshot to '${fileName}'...`)
    await fs.writeFile(fileName, image, {
      encoding: 'base64',
    })
    throw err
  } finally {
    await driver.quit()
  }
}

async function getLccn(driver: WebDriver, book: Book, title: string): Promise<string> {
  console.log(`Getting LCCN for ISBN '${book.ISBN}' and title '${title}'...`)
  await driver.get(`https://www.loc.gov/books/?all=true&q=${title.replace(/\ /g, '+')}`)
  const searchResultElement = By.id('results')
  await driver.wait(until.elementLocated(searchResultElement), 1000 * 20)
  const results = await driver.findElement(searchResultElement).findElement(By.css('ul')).findElements(By.css('li'))
  const formattedAuthor = book.Author
    ? book.Author.includes(', ')
      ? book.Author
      : book.Author.split(' ').reverse().join(', ')
    : ''
  let match
  for (let i = 0; i < results.length && !match; i++) {
    const contributorLocator = By.className('contributor')
    const dateLocator = By.className('date')
    const titleLocator = By.className('item-description-title')
    if (book.Author && (await elementExists(results[i], contributorLocator))) {
      const author = (await results[i].findElement(contributorLocator).getText()).replace(/Contributor\: /, '')
      if (author === formattedAuthor) {
        console.log(`Matched LCCN by author for ISBN '${book.ISBN}'`)
        match = results[i]
      }
    }
    if (!match && book.Published && (await elementExists(results[i], dateLocator))) {
      const year = new Date(book.Published).getFullYear()
      const date = await results[i].findElement(dateLocator).findElement(By.css('span')).getText()
      if (date === year.toString()) {
        console.log(`Matched LCCN by date for ISBN '${book.ISBN}'`)
        match = results[i]
      }
    }
    if (!match && (await elementExists(results[i], titleLocator))) {
      const name = (await results[i].findElement(titleLocator).findElement(By.css('a')).getText())
        .trim()
        .replace(/\ \//, '')
      if (name.toLowerCase() === title.toLowerCase()) {
        console.log(`Matched LCCN by title for ISBN '${book.ISBN}'`)
        match = results[i]
      }
    }
  }
  if (match) {
    const link = await driver
      .findElement(By.className('item-description-title'))
      .findElement(By.css('a'))
      .getAttribute('href')
    const lccn = link.split('/').at(-1) || ''
    if (env.VERIFY_ISBN) {
      console.log(
        `Verifying ISBN '${book.ISBN}' for LCCN '${lccn}' due to 'VERIFY_ISBN' environment variable set to 'true'...`
      )
      if (await verifyIsbn(driver, lccn, book.ISBN)) {
        return lccn
      }
      console.log(`Could not verify ISBN '${book.ISBN}' against LCCN '${lccn}'`)
      return 'N/A'
    }
    return lccn
  }
  return 'N/A'
}

async function elementExists(driver: WebDriver | WebElement, locator: Locator): Promise<boolean> {
  try {
    await driver.findElement(locator)
  } catch (err: any) {
    if (err.toString().includes('Unable to locate element')) {
      return false
    }
    throw err
  }
  return true
}

async function verifyIsbn(driver: WebDriver, lccn: string, isbn: string): Promise<boolean> {
  console.log(`Found LCCN '${lccn}', verifying against ISBN '${isbn}'...`)

  await driver.get(`https://lccn.loc.gov/${lccn}`)
  const isbnTitle = await driver.findElement(By.xpath("//*[ contains (text(), 'ISBN' ) ]"))
  const isbns = await isbnTitle.findElement(By.xpath('./..')).findElement(By.css('ul')).findElements(By.css('li'))
  console
  let verified = false
  for (let j = 0; j < isbns.length && !verified; j++) {
    if ((await isbns[j].findElement(By.css('span')).getText()) === isbn) {
      verified = true
    }
  }
  return verified
}

type Book = {
  ISBN: string
  Name: string
  Text: string
  Date: string
  Time: string
  Title?: string
  Author?: string
  Published?: string
  LCCN?: string
}
