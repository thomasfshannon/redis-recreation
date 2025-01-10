// Enable logging temporarily to debug
const LOGGED_ENABLED = true

const logger = {
  info: (...message: any[]) => {
    if (LOGGED_ENABLED) {
      console.info(message.join(' '))
    }
  },
  error: (...message: any[]) => {
    if (LOGGED_ENABLED) {
      console.error(message.join(' '))
    }
  },
}
export default logger