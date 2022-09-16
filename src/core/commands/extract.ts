import * as vscode from 'vscode'

import meta from '../meta'
import * as path from 'path'
import { i18nFile } from '../i18nFile'
import Config from '../Config'
import { StructureType, MatchMode } from '../i18nFile/I18nItem'

const toCamelCase = str => {
  return str.replace(/(-\w)/g, $1 => {
    return $1[1].toUpperCase()
  })
}

const onExtract = async ({
  filepath,
  text,
  keyReplace,
  promptText = `请输入要保存的路径，例如:button.add`,
  keyTransform = key => key,
  defaultKeyTransform = key => key
}: {
  filepath: string
  text: string
  keyReplace: (key) => string
  promptText?: string
  keyTransform?: (key) => string
  defaultKeyTransform?: (key) => string
}) => {
  console.log(filepath, text, Config.i18nPaths);

  const i18n = i18nFile.getFileByFilepath(filepath)

  let transParseKey = (await i18n.transByApi({
    text: text,
    from: Config.sourceLocale,
    to: ''
  })) || text
  transParseKey = transParseKey.toLowerCase().replace(/\s+[a-z]?/g, (match) => {
    return match.trim().toUpperCase()
  })
  let defaultKey = 'type.' + transParseKey.replace(/[^a-zA-Z]/, '')

  let key = await vscode.window.showInputBox({
    prompt: promptText,
    valueSelection: [ 0 , defaultKey.lastIndexOf('.')],
    value: defaultKey
  })

  if (!key) {
    return
  }

  key = keyTransform(key)


  if (i18n.structureType === StructureType.DIR && key.indexOf('.') === -1) {
    key = `common.${key}`
  }

  // 重复检测
  const isOverride = await i18n.overrideCheck(key)

  // 替换内容
  vscode.window.activeTextEditor.edit(editBuilder => {
    const { start, end } = vscode.window.activeTextEditor.selection

    editBuilder.replace(new vscode.Range(start, end), keyReplace(key))
  })

  if (!isOverride) {
    return
  }

  // 翻译内容
  let transData = i18n.getI18n(key, MatchMode.ADD)
  const mainTrans = transData.find(item => item.lng === Config.sourceLocale)
  const selectPath = mainTrans.selectWriteI18nPath ? await mainTrans.selectWriteI18nPath() : ''
  if (selectPath) {
    transData.forEach(item => {
      item.filepath = selectPath
    })
  }
  mainTrans.text = text
  transData = await i18n.transI18n(transData)
  // 写入翻译
  i18n.writeI18n(transData, MatchMode.ADD)
  mainTrans.selectWriteI18nPath = null
}

export const extract = () => {
  return vscode.commands.registerCommand(meta.COMMANDS.extract, onExtract)
}
