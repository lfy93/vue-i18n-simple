import * as vscode from 'vscode'

import meta from '../meta'
import { i18nFile } from '../i18nFile'
import Config from '../Config'
import { MatchMode } from '../i18nFile/I18nItem'


const findValue = (i18nItems, keypath, text, result = []): Array<{ keypath: string, keyName: string }|undefined> => {
    for (const [key, value] of Object.entries(i18nItems)) {
        if (value instanceof Object) {
            findValue(value, key, text, result)
        } else {
            if (value === text) {
                result.push({
                    keypath,
                    keyName: key
                }) 
            }
        }
    }
    return result
}

const onFindI18n = async ({
    filepath,
    text,
    promptText = `请选择你需要替换的的项`,
    keyReplace,
}: {
    filepath: string
    text: string
    promptText?: string
    keyReplace?: (template) => Function
}) => {
    const sourceLocale = Config.sourceLocale
    const i18n = i18nFile.getFileByFilepath(filepath)
    let transData = i18n.getI18n('', MatchMode.FIND)
    const currentI18nItems = transData.find(i18nItem => i18nItem.lng === sourceLocale)
    const i18nItemKeys = findValue(currentI18nItems.text, '', text)

    if(i18nItemKeys.length <= 0) {
        vscode.window.showInformationMessage(
            `未找到相关内容`,
            { modal: true },
            '知道了'
        )
        return
    }

    const quickPick = vscode.window.createQuickPick()
    quickPick.placeholder = promptText
    quickPick.items = i18nItemKeys.map(i18nItemKey => ({ 
        label: `${i18nItemKey.keypath}.${i18nItemKey.keyName}`, 
        buttons: [
            { tooltip: `{{ $t('{key}') }}`, iconPath: new vscode.ThemeIcon('symbol-module')}, 
            { tooltip: `this.$t('{key}')`, iconPath: new vscode.ThemeIcon('selection')},
            { tooltip: `$t('{key}')`, iconPath: new vscode.ThemeIcon('tasklist') }
        ] 
    } ))
    quickPick.show();
    quickPick.onDidTriggerItemButton(selectBtnInfo=>{
        console.log({selectBtnInfo});
        // 替换内容
        vscode.window.activeTextEditor.edit(editBuilder => {
            const { start, end } = vscode.window.activeTextEditor.selection
            const keyReplaceTemplate = keyReplace(selectBtnInfo.button.tooltip)
            editBuilder.replace(new vscode.Range(start, end), keyReplaceTemplate(selectBtnInfo.item.label))
            quickPick.hide();
        })
    })
}

export const findI18n = () => {
    return vscode.commands.registerCommand(meta.COMMANDS.findI18n, onFindI18n)
}
