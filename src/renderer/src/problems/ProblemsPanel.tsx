import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Problem } from '@shared/types'
import { Icon } from '../components/Icon'
import { IconButton } from '../components/Button'
import { EmptyState } from '../components/Feedback'
import { useApp } from '../state/AppContext'

function explanationFor(problem: Problem, translate: TFunction): string {
  if (problem.code) {
    const text = translate(`problems.explain.${problem.code}`, { defaultValue: '' })
    if (text) return text
  }
  if (problem.source === 'php-syntax' || problem.source === 'php-runtime') {
    return translate('problems.phpExplain')
  }
  return ''
}

export function ProblemsPanel(): ReactNode {
  const { t } = useTranslation()
  const { problems, showProblems, setPanel, navigateProblem } = useApp()

  const errors = useMemo(
    () => problems.filter((problem) => problem.severity === 'error').length,
    [problems]
  )
  const warnings = problems.length - errors

  return (
    <section className={`problems-panel${showProblems ? ' is-open' : ''}`} aria-label={t('problems.title')}>
      <div className="problems-panel__header">
        <button
          type="button"
          className="problems-panel__toggle"
          onClick={() => setPanel('problems', !showProblems)}
          aria-expanded={showProblems}
        >
          <span className={`problems-panel__badge${errors > 0 ? ' has-errors' : ''}`}>
            <Icon name={problems.length > 0 ? 'bug' : 'check'} size={18} />
          </span>
          <span className="md-title-small">{t('problems.title')}</span>
          <span className="problems-panel__counts">
            {errors > 0 ? (
              <span className="count-pill count-pill--error">
                {t('problems.errors', { count: errors })}
              </span>
            ) : null}
            {warnings > 0 ? (
              <span className="count-pill count-pill--warning">
                {t('problems.warnings', { count: warnings })}
              </span>
            ) : null}
            {problems.length === 0 ? (
              <span className="problems-panel__calm">{t('problems.empty')}</span>
            ) : null}
          </span>
        </button>
        <IconButton
          icon={showProblems ? 'chevronDown' : 'chevronRight'}
          label={showProblems ? t('actions.close') : t('problems.title')}
          dense
          tooltipSide="top"
          onClick={() => setPanel('problems', !showProblems)}
        />
      </div>

      {showProblems ? (
        <div className="problems-panel__body">
          {problems.length === 0 ? (
            <EmptyState icon="check" title={t('problems.empty')} hint={t('problems.emptyHint')} />
          ) : (
            <ul className="problem-list">
              {problems.map((problem, index) => {
                const explanation = explanationFor(problem, t)
                return (
                  <li key={`${problem.file}:${problem.line}:${problem.column}:${index}`}>
                    <button
                      type="button"
                      className="problem-row"
                      title={t('problems.goToLine', { line: problem.line })}
                      onClick={() => navigateProblem(problem)}
                    >
                      <span className={`problem-row__icon is-${problem.severity}`}>
                        <Icon name="alert" size={18} />
                      </span>
                      <span className="problem-row__content">
                        <span className="problem-row__message">{problem.message}</span>
                        {explanation ? (
                          <span className="problem-row__explain">{explanation}</span>
                        ) : null}
                      </span>
                      <span className="problem-row__meta">
                        <span className={`source-chip is-${problem.severity}`}>
                          {t(`problems.source.${problem.source}`)}
                        </span>
                        <span className="problem-row__place">
                          {problem.file}:{problem.line}:{problem.column}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
