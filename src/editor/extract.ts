import { Extract } from '../core/editor'
import * as vscode from 'vscode'
import { type } from 'os'

class ExtractProvider extends Extract {
  keyReplace(template) {
    return key => template.replace(/{key}/g, key)
  }

  getCommands(params) {
    return [
      {
        command: 'vue-i18n-simple.extract',
        title: `提取为{{$t('key')}}`,
        arguments: [
          {
            ...params,
            keyReplace: this.keyReplace(`{{ $t('{key}') }}`)
          }
        ]
      },
      {
        command: 'vue-i18n-simple.extract',
        title: `提取为this.$t('key')`,
        arguments: [
          {
            ...params,
            keyReplace: this.keyReplace(`this.$t('{key}')`)
          }
        ]
      },
      {
        command: 'vue-i18n-simple.extract',
        title: `提取为$t('key')`,
        arguments: [
          {
            ...params,
            keyReplace: this.keyReplace(`$t('key')`)
          }
        ]
      },
      {
        command: 'vue-i18n-simple.findI18n',
        title: `查询已有语言库`,
        arguments: [
          {
            ...params,
            keyReplace: this.keyReplace,
          }
        ]
      }
    ]
  }
}

export const extractEditor = () => {
  return vscode.languages.registerCodeActionsProvider(
    [
      { language: 'vue', scheme: '*' },
      { language: 'javascript', scheme: '*' },
      { language: 'typescript', scheme: '*' }
    ],
    new ExtractProvider(),
    {
      providedCodeActionKinds: [vscode.CodeActionKind.Refactor]
    }
  )
}
