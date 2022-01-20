import { cleanEnv, str, num } from 'envalid'

type ENV = {
  INPUT_CSV: string
  OUTPUT_CSV: string
  PAGE_TIMEOUT_MS: number
}

const env = cleanEnv(process.env, {
  INPUT_CSV: str({
    desc: 'Full path to CSV file containing ISBN information',
  }),
  OUTPUT_CSV: str({
    default: 'INPUT_CSV',
    desc: 'Full path to CSV file to output LCCN information',
  }),
  PAGE_TIMEOUT_MS: num({
    default: 60000,
    desc: 'The maximum number of milliseconds to wait for browser pages to load',
  }),
})

const cleanedEnv: Readonly<ENV> = {
  INPUT_CSV: env.INPUT_CSV,
  OUTPUT_CSV: !env.OUTPUT_CSV || env.OUTPUT_CSV === 'INPUT_CSV' ? env.INPUT_CSV : env.OUTPUT_CSV,
  PAGE_TIMEOUT_MS: env.PAGE_TIMEOUT_MS,
}

export default cleanedEnv
