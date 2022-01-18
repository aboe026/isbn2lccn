import { cleanEnv, str, bool } from 'envalid'

export default cleanEnv(process.env, {
  INPUT_CSV: str({
    desc: 'Full path to CSV file containing ISBN information',
  }),
  VERIFY_ISBN: bool({
    default: false,
    desc: 'Whether or not to check matched LCCN has matching ISBN on LOC website',
  }),
})
