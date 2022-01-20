import { config } from 'dotenv'
config()

import CSV from './csv'
import { Builder, By, Locator, WebDriver, WebElement } from 'selenium-webdriver'
import fetch from 'node-fetch'
import fs from 'fs-extra'
import path from 'path'
import { platform } from 'os'
import prettyMilliseconds from 'pretty-ms'

import env from './env'
import { LccnHeuristic, LccnHeuristicInput } from './lccn-heuristic'

const NOT_AVAILABLE = 'N/A'
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
    if (!book.Title || !book.Author || !book.Published) {
      console.log(`Getting title, author and publish date of '${book.ISBN}'...`)
      const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${book.ISBN}&format=json&jscmd=data`)
      const text = await response.text()
      let json
      try {
        json = JSON.parse(text)
      } catch (err) {
        throw Error(`Could not parse ISBN '${book.ISBN}' response of '${text}' as JSON: ${err}`)
      }

      let title, author, published
      const info = json[`ISBN:${book.ISBN}`]
      if (info) {
        if (info.title) {
          title = info.title
          if (title.endsWith('.')) {
            title = title.substring(0, title.length - 1)
          }
        }

        if (info.authors) {
          author = info.authors[0].name
        }

        if (info.publish_date) {
          published = new Date(info.publish_date).toISOString()
        }
      }
      if (!book.Title) {
        book.Title = title || NOT_AVAILABLE
      }
      if (!book.Author) {
        book.Author = author || NOT_AVAILABLE
      }
      if (!book.Published) {
        book.Published = published || NOT_AVAILABLE
      }
    }
    await CSV.write(books, env.OUTPUT_CSV)
  }
}

function addWebDriversToPath() {
  const driverDir = path.join(__dirname, '../drivers')
  const pathSeparator = platform() === 'win32' ? ';' : ':'
  process.env.PATH = `${driverDir}${pathSeparator}${process.env.path}`
}

async function addLccns(books: Book[]): Promise<void> {
  let processed = 0
  const totalWithoutLccN = books.filter((book) => !book.LCCN).length
  if (totalWithoutLccN > 0) {
    const start = Date.now()
    const driver = await new Builder().forBrowser('chrome').build()
    try {
      for (const book of books) {
        if (!book.LCCN) {
          const lccn = await getLccn(driver, book)
          if (lccn) {
            book.LCCN = lccn.value
            book.Link = `https://lccn.loc.gov/${book.LCCN}`
            book.Verified = LccnHeuristic.deserialize(lccn.score).Verified ? 'yes' : 'no'
            if (book.Verified !== 'yes') {
              console.log(`Could not verify ISBN '${book.ISBN}' against LCCN '${book.LCCN}'`)
            }
          } else {
            console.log(`Could not determine LCCN for ISBN '${book.ISBN}', marking as '${NOT_AVAILABLE}'`)
            book.LCCN = NOT_AVAILABLE
            book.Link = ''
            book.Verified = ''
          }
          await CSV.write(books, env.OUTPUT_CSV)
          processed++
          const percent = processed / totalWithoutLccN
          const msElapsed = Date.now() - start
          const msEstTotal = (msElapsed * totalWithoutLccN) / processed
          const timingPrintout =
            processed === totalWithoutLccN
              ? `took ${prettyMilliseconds(msElapsed)}`
              : `estimated ${prettyMilliseconds(msEstTotal - msElapsed)} remaining`
          console.log(
            `Processed ${Number(percent).toLocaleString(undefined, {
              style: 'percent',
              minimumFractionDigits: 0,
            })} (${processed}/${totalWithoutLccN}), ${timingPrintout}`
          )
        }
      }
    } catch (err) {
      await captureScreenshot(driver, 'error')
      throw err
    } finally {
      await driver.quit()
    }
  }
}

async function getLccn(driver: WebDriver, book: Book): Promise<LCCN> {
  let lccns: LCCN[] = []
  if (book.Title !== NOT_AVAILABLE) {
    lccns = sortLccnResults(lccns, await getPotentialLccns(driver, book, book.Title || ''))
    if (lccns && lccns.length > 0 && LccnHeuristic.deserialize(lccns[0].score).Verified) {
      return lccns[0]
    }
  }
  if (book.Name !== book.Title) {
    lccns = sortLccnResults(lccns, await getPotentialLccns(driver, book, book.Name))
    if (lccns && lccns.length > 0 && LccnHeuristic.deserialize(lccns[0].score).Verified) {
      return lccns[0]
    }
    if (book.Title?.includes(' by ')) {
      const title = book.Title ? book.Title.replace(/\ by\ .*/, '') : ''
      lccns = sortLccnResults(lccns, await getPotentialLccns(driver, book, title))
      if (lccns && lccns.length > 0 && LccnHeuristic.deserialize(lccns[0].score).Verified) {
        return lccns[0]
      }
      if (book.Name.includes(' by ')) {
        lccns = sortLccnResults(lccns, await getPotentialLccns(driver, book, book.Name.replace(/\ by\ .*/, '')))
        if (lccns && lccns.length > 0 && LccnHeuristic.deserialize(lccns[0].score).Verified) {
          return lccns[0]
        }
      }
    }
  }
  return lccns[0]
}

function sortLccnResults(first: LCCN[], second: LCCN[]): LCCN[] {
  const merged = first.concat(second)
  return merged.sort((a, b) => b.score - a.score) // sort in descending order -> largest values first, smallest last
}

async function getPotentialLccns(driver: WebDriver, book: Book, title: string): Promise<LCCN[]> {
  const lccns = await getMatchingLccns(driver, book, title)
  let verified
  for (let i = 0; i < lccns.length && !verified; i++) {
    if (await verifyIsbn(driver, lccns[i].value, book.ISBN)) {
      verified = true
      lccns[i].score = LccnHeuristic.update({ existing: lccns[i].score, newVerified: true })
    }
  }
  return lccns
}

async function refreshPageUntilResults(
  driver: WebDriver,
  url: string,
  start: number | undefined,
  timeout: number
): Promise<WebElement[]> {
  if (!start) {
    start = Date.now()
    await promiseTimeout(driver.get(url), env.PAGE_TIMEOUT_MS)
  }
  if (Date.now() >= start + timeout) {
    throw Error('Timeout tring to load search results')
  }
  await sleep(1000)
  const searchResultElement = By.css('#results > ul > li')
  if (await elementExists(driver, searchResultElement)) {
    return driver.findElements(searchResultElement)
  } else if (await elementExists(driver, By.className('site-error'))) {
    await driver.get(url) // site error, refresh page and to try again
    return refreshPageUntilResults(driver, url, start, timeout)
  } else if (await elementExists(driver, By.className('noresults-for'))) {
    return []
  }
  return refreshPageUntilResults(driver, url, start, timeout)
}

async function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, milliseconds)
  })
}

async function promiseTimeout(promise: Promise<any>, timeoutMs: number): Promise<any> {
  let timeoutHandle: NodeJS.Timeout
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(`Timeout of '${timeoutMs}' milliseconds exceeded for promise`), timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).then((result) => {
    clearTimeout(timeoutHandle)
    return result
  })
}

async function getMatchingLccns(driver: WebDriver, book: Book, title: string): Promise<LCCN[]> {
  const lccns: LCCN[] = []
  console.log(`Attempting to get LCCN for ISBN '${book.ISBN}' with title '${title}'...`)
  const url = `https://www.loc.gov/books/?all=true&q=${title.replace(/\ /g, '+')}`
  console.log(`Accessing URL '${url}'`)
  const results: WebElement[] = await refreshPageUntilResults(driver, url, undefined, env.PAGE_TIMEOUT_MS)
  for (let i = 0; i < results.length; i++) {
    const contributorLocator = By.className('contributor')
    const dateLocator = By.className('date')
    const titleLocator = By.className('item-description-title')
    const heuristicInput: LccnHeuristicInput = LccnHeuristic.deserialize(0)

    if (await elementExists(results[i], titleLocator)) {
      const name = (await results[i].findElement(titleLocator).findElement(By.css('a')).getText())
        .trim()
        .replace(/\ \//, '') // get rid of slash ("/") the UI has for title / author
      if (name.toLowerCase() === title.toLowerCase()) {
        heuristicInput.Matches.Title = true
      }
    }
    if (book.Author && (await elementExists(results[i], contributorLocator))) {
      const author = (await results[i].findElement(contributorLocator).getText()).replace(/Contributor\: /, '')
      const formattedAuthor = book.Author.includes(', ') ? book.Author : book.Author.split(' ').reverse().join(', ')
      if (author === formattedAuthor) {
        heuristicInput.Matches.Author = true
      }
    }
    if (book.Published && (await elementExists(results[i], dateLocator))) {
      const year = new Date(book.Published).getFullYear()
      const date = await results[i].findElement(dateLocator).findElement(By.css('span')).getText()
      if (date === year.toString()) {
        heuristicInput.Matches.Date = true
      }
    }

    let score = LccnHeuristic.serialize(heuristicInput)
    if (score > 0) {
      const lccn = await getResultLccn(results[i])
      if (lccn) {
        score = LccnHeuristic.update({ existing: score, newIndex: results.length - i })
        console.log(`Matched ISBN '${book.ISBN}' to LCCN '${lccn}' with heuristic score '${score}'`)
        lccns.push({
          value: lccn,
          score,
        })
      }
    }
  }
  return sortLccnResults(lccns, [])
}

async function getResultLccn(result: WebElement): Promise<string> {
  const link = await result
    .findElement(By.className('item-description-title'))
    .findElement(By.css('a'))
    .getAttribute('href')
  const matches = link.match(/https:\/\/lccn\.loc\.gov\/(\d+)/)
  return matches ? matches[1] : ''
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
  console.log(`Verifying against ISBN '${isbn}' against LCCN '${lccn}'...`)
  await driver.get(`https://lccn.loc.gov/${lccn}`)
  const isbnLocator = By.xpath("//*[contains(@class, 'item-title') and contains(text(), 'ISBN' ) ]")
  if (await elementExists(driver, isbnLocator)) {
    const isbnTitle = await driver.findElement(isbnLocator)
    const listedIsbns = await isbnTitle.findElements(By.xpath('./../ul/li'))
    for (const listedIsbn of listedIsbns) {
      const text = await listedIsbn.findElement(By.css('span')).getText()
      const digits = text.match(/[\D+]?(\d+)[\D+]?/) // ignore non-digit groups - eg " (hardcover)" or " (ebook)"
      if (digits && digits[0].trim() === isbn) {
        return true
      }
    }
  }

  return false
}

async function captureScreenshot(driver: WebDriver, namePrefix: string): Promise<void> {
  const image = await driver.takeScreenshot()
  const screenshotsDir = path.join(__dirname, '../screenshots')
  await fs.ensureDir(screenshotsDir)
  const filePath = path.join(screenshotsDir, `${namePrefix}-${new Date().toISOString().replace(/:|\./g, '-')}.png`)
  console.log(`Saving screenshot to '${filePath}'...`)
  await fs.writeFile(filePath, image, {
    encoding: 'base64',
  })
}

type LCCN = {
  value: string
  score: number
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
  Link?: string
  Verified?: string
}
