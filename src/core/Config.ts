import * as vscode from 'vscode'
import * as path from 'path'
import Utils from './utils'

const I18N_PATHS_KEY = 'i18nPaths'
const I18N_COMMON_PATH_KEY = 'i18nCommonPath'
const FILENAME_TO_KEBAB_CASE = 'filenameToKebabCase'

export default class Config {
  static extAuthor: string
  static extName: string

  static get extension(): vscode.Extension<any> {
    return vscode.extensions.getExtension(this.extensionId)
  }

  static get extensionId() {
    return `${this.extAuthor}.${this.extName}`
  }

  static get extensionName() {
    return this.extName
  }

  static get i18nPaths() {
    const rootPath = vscode.workspace.rootPath
    const paths = this.getConfig(I18N_PATHS_KEY)
    const relativePaths = paths ? paths.split(',') : []

    return relativePaths.map((pathItem: string) =>
      path.resolve(rootPath, pathItem)
    )
  }

  static get parsersTypescriptTsNodePath(): string {
    const config = this.getConfig('tsNodePath')!

    return `node "${path.resolve(this.extension.extensionPath, config)}"`
  }

  static get i18nCommonPath() {
    const rootPath = vscode.workspace.rootPath
    const commonPath = this.getConfig(I18N_COMMON_PATH_KEY)
    return path.resolve(rootPath, commonPath)
  }

  static get filenameToKebabCase() {
    return this.getConfig(FILENAME_TO_KEBAB_CASE)
  }  

  static get version() {
    return this.extension.packageJSON.version
  }

  static get hasI18nPaths() {
    return !!this.i18nPaths.length
  }

  static get sourceLocale() {
    return Utils.normalizeLng(this.getConfig('sourceLocale') || 'zh-CN')
  }

  static getConfig(key): any {
    return vscode.workspace.getConfiguration(this.extensionName).get(key)
  }

  static setConfig(key, value, isGlobal = false) {
    return vscode.workspace
      .getConfiguration(this.extensionName)
      .update(key, value, isGlobal)
  }

  static updateI18nPaths(paths: string[]) {
    const i18nPaths = [...new Set(this.i18nPaths.concat(paths))]
    this.setConfig(I18N_PATHS_KEY, i18nPaths.join(','))
  }
}