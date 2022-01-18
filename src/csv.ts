import fs from 'fs-extra'
import { parse } from 'csv-parse'
import { stringify } from 'csv-stringify'

export default class CSV {
  static async parse(file: string): Promise<any[]> {
    const contents = await fs.readFile(file, {
      encoding: 'utf-8',
    })
    return new Promise((resolve, reject) => {
      parse(
        contents,
        {
          columns: true,
          trim: true,
          skipEmptyLines: true,
          relaxColumnCount: true,
        },
        (err, records) => {
          if (err) {
            reject(err)
          } else {
            resolve(records)
          }
        }
      )
    })
  }

  static async write(data: any[], file: string): Promise<void> {
    return new Promise((resolve, reject) => {
      stringify(
        data,
        {
          header: true,
        },
        async (err, output) => {
          if (err) {
            reject(err)
          } else {
            try {
              await fs.writeFile(file, output)
              resolve()
            } catch (err) {
              reject(err)
            }
          }
        }
      )
    })
  }
}
