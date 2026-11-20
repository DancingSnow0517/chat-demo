import { useTranslate } from '../../i18n/index.js'
import { consumeLoginError } from '../../services/auth.js'
import { Button } from '../base/Button.js'
import styles from './Login.module.css'

/** 登录页：仅一个 GitHub OAuth 入口，无表单。 */
export const Login = () => {
  const t = useTranslate()
  const loginError = consumeLoginError()
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('appName')}</h1>
        {loginError === 'denied' ? (
          <p className={styles.error}>{t('loginDenied')}</p>
        ) : loginError === 'github' ? (
          <p className={styles.error}>{t('loginGithubFailed')}</p>
        ) : null}
        <Button
          variant="primary"
          size="l"
          onClick={() => {
            location.href = '/api/auth/github'
          }}
        >
          {t('loginWithGithub')}
        </Button>
      </div>
    </div>
  )
}
