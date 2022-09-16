import * as vscode from 'vscode'
import * as path from 'path'
import { google, baidu, youdao } from 'translation.js'
import { get, set, omit, isEmpty, reject } from 'lodash'
import * as fg from 'fast-glob'
import * as YAML from 'yaml'
import * as fs from 'fs'
import Utils from '../utils'
import Config from '../Config'
import Log from '../Log'
import { i18nFile } from './I18nFile'
const child_process = require('child_process')

interface ILng {
  localepath: string
  filepath: string
  isDirectory: boolean
  originLng: string
  lng: string
}

export interface ITransData extends ILng {
  id: string
  keypath: string
  key: string
  text: any,
  selectWriteI18nPath?:any
}

export enum StructureType {
  DIR, // 结构是文件夹的模式
  FILE // 结构是语言文件的模式
}

export enum MatchMode {
  READ, // 读取操作
  WRITE, // 写入操作
  ADD, // 新增
  FIND,// 查找
}

const FILE_EXT = {
  YAML: '.yml',
  JSON: '.json',
  Js: '.js'
}
const fileCache: any = {}

const emptyTrans = (transData: ITransData[]) => {
  return transData.every((item) => !item.text);
};

export class I18nItem {
  localepath: string
  structureType: StructureType
  fileExt = FILE_EXT.Js

  constructor(localepath) {
    this.localepath = localepath
    this.setStructureType()
    // this.setFileExt()
    this.watch()
  }

  private setStructureType() {
    const isDirectory = this.lngs.some(lngItem => lngItem.isDirectory)
    this.structureType = isDirectory ? StructureType.DIR : StructureType.FILE
  }

  private setFileExt() {
    const [lngInfo] = this.lngs

    if (!lngInfo?.isDirectory) {
      const { ext } = path.parse(lngInfo?.filepath||'')
      this.fileExt = ext
      return
    }

    const hasYaml = fs.readdirSync(lngInfo.filepath).some(filename => {
      return path.parse(filename).ext === FILE_EXT.YAML
    })

    this.fileExt = hasYaml ? FILE_EXT.YAML : FILE_EXT.Js
  }

  private watch() {
    const watcher = vscode.workspace.createFileSystemWatcher(
      `${this.localepath}/**`
    )

    const updateFile = (type, { fsPath: filepath }) => {
      console.log({ type, filepath }, '监听--');
      return
      const { ext } = path.parse(filepath)
      if (![FILE_EXT.JSON, FILE_EXT.YAML, FILE_EXT.Js].includes(ext)) {
        return
      }

      switch (type) {
        case 'del':
          Reflect.deleteProperty(fileCache, filepath)
          break

        case 'change':
          fileCache[filepath] = this.readFile(filepath)
          break
        case 'create':
          fileCache[filepath] = this.readFile(filepath)
          break

        default:
        // do nothing..
      }
    }
    watcher.onDidChange(updateFile.bind(this, 'change'))
    watcher.onDidCreate(updateFile.bind(this, 'create'))
    watcher.onDidDelete(updateFile.bind(this, 'del'))
  }

  get lngs(): ILng[] {
    const { localepath } = this
    const files = fs
      .readdirSync(localepath)
      .map(
        (pathname: string): ILng => {
          const filepath = path.resolve(localepath, pathname)
          const isDirectory = fs.lstatSync(filepath).isDirectory()
          const originLng = isDirectory ? pathname : path.parse(pathname).name

          return {
            localepath,
            filepath,
            isDirectory,
            originLng,
            lng: Utils.normalizeLng(originLng)
          }
        }
      )
      .filter(lngItem => !!lngItem.lng)
      .sort(lngItem => {
        return lngItem.lng === Config.sourceLocale ? -1 : 1
      })
      
    if (!files.length) {
      Log.error(`未能识别locale目录:${localepath}`)
    }

    return files
  }

  dataParse(filepath: string, data: any) {
    const { ext } = path.parse(filepath)
    if(ext === FILE_EXT.Js) {
      data = data.replace('export default', '')
      data = data.replace(/\w+:/g, (match) => {
        return `"${match.slice(0, -1)}":`
      })
      data = data.replace(',\r\n}', '\r\n}')
    }
    
    return ext === FILE_EXT.YAML ? YAML.parse(data) : JSON.parse(data)
  }

  dataStringify(filepath: string, keypath: string, isDel: boolean = false, text?: string, mode: MatchMode = MatchMode.WRITE):string {
    
    let data = fs.readFileSync(filepath, 'utf-8')
    const reg = /\s*(\w+):\s*(\"[^"]*\")(,)?/gm
    const propsLenght: number = data.match(reg).length || 0
    let randomNum:number = Math.floor(Math.random() * propsLenght)
    data = data.replace(reg, (match, p1, p2, p3) => {
      
      if (p1 === keypath) {
        console.table({ filepath, keypath, text, edit: true });
        return isDel ? '' : match.replace(p2, `"${text}"`)
      } else if(mode === MatchMode.ADD && randomNum === 0) {
        randomNum--
        let itemStr = match.replace(p1, keypath).replace(p2, `"${text || ''}"`) + (p3 ? '' : ',')
        console.table({ filepath, keypath, text, add: true });
        return itemStr.concat(match)
      }
      randomNum-- 
      return match
    })
    return data
  }

  readFile(filepath: string, useCache: boolean = false): any {
    // TODO: LRU缓存优化
    if (useCache) {
      return fileCache[filepath] || this.readFile(filepath)
    }
    try {
      // const data = this.dataParse(filepath, fs.readFileSync(filepath, 'utf-8')) // 原始未兼容方法
      // const data = await axios.get(filepath) //1 、网络请求 不可行原因 没有本地服务返回对应资源
      // const data = await import(filepath) // 2、ts编译环境为commonjs 会自动把 import() 转换为require
      // 3、通过ts-node 命令行去执行返回
      const data = this.load(filepath)
      fileCache[filepath] = data
      // fileCache[filepath] = new Proxy(fileCacheTarget[filepath], handler)
      return typeof data === 'object' ? data : {}
    } catch (err) {
      // console.error(err);
      
      return {}
    }
  }

  load(filepath: string) {
    const loader = path.resolve(Config.extension.extensionPath!, 'static/loader.js')
    const tsNode = Config.parsersTypescriptTsNodePath
    const dir = vscode.workspace.rootPath
    const compilerOptions = {
      importHelpers: false,
      allowJs: true,
      module: 'commonjs',
      // ...Config.parsersTypescriptCompilerOption,
    }
    const options = JSON.stringify(compilerOptions).replace(/"/g, '\\"')
    const cmd = `${tsNode} --dir "${dir}" --transpile-only --compiler-options "${options}" "${loader}" "${filepath}"`
    const data = child_process.execSync(cmd, { encoding: 'utf8'  })
    return JSON.parse(data.trim())
  }

  async transByApi({
    text,
    from = Config.sourceLocale,
    to
  }: {
    text: string
    from?: string
    to: string
  }) {
    const plans = [google, baidu, youdao]
    const errors: Error[] = []

    let res = undefined
    for (const plan of plans) {
      try {
        res = await plan.translate({ text, from, to })
        break
      } catch (e) {
        errors.push(e)
      }
    }

    const result = res && res.result && res.result[0]
    if (!result) throw errors

    return result
  }

  async overrideCheck(keypath): Promise<boolean> {
    let [{ text }] = this.getI18n(keypath, MatchMode.FIND)
    // 检测尾 key
    let overrideKey = text ? keypath : undefined

    if (!overrideKey) {
      return true
    }

    const overrideText = '覆盖'
    const isOverride = await vscode.window.showInformationMessage(
      `已有 ${overrideKey} 👉 ${text}, 覆盖吗？`,
      { modal: true },
      overrideText
    )
    return isOverride === overrideText
  }

  transI18n(transData: ITransData[]): Promise<ITransData[]> {
    const mainTrans = transData.find(item => item.lng === Config.sourceLocale)

    const tasks = transData.map(async transItem => {
      if (transItem === mainTrans) {
        return transItem
      }

      transItem.text =
        (await this.transByApi({
          text: mainTrans.text,
          from: Config.sourceLocale,
          to: transItem.lng
        })) || transItem.text

      return transItem
    })

    return Promise.all(tasks)
  }

  removeI18n(key: string) {
    const transData = this.getI18n(key)

    transData.forEach(({ filepath, keypath }) => {
      const file = fileCache[filepath]
      delete file[keypath]
      fs.writeFileSync(
        filepath,
        this.dataStringify(filepath, keypath, true)
      )
    })
  }

  getI18n(key: string, mode: MatchMode = MatchMode.READ): ITransData[] {
    let transData = this.getFileI18n(key, mode)

    // 尝试使用 common 配置
    if (emptyTrans(transData) && Config.i18nCommonPath && mode === MatchMode.READ) {
      const commonI18n = i18nFile.getFileByFilepath(Config.i18nCommonPath)
      transData = commonI18n.getFileI18n(key, mode)
    }
    return transData
  }

  getFileI18n(key: string, mode: MatchMode = MatchMode.READ): ITransData[]  {
    return this.lngs.map((lngItem) => {
      let i18nFilepath = lngItem.filepath
      let keypath = key
      let kabekCaseFilename
      let file
      let selectWriteI18nPath
      if (this.structureType === StructureType.DIR) {
        const [filename, ...realpath] = key.split('.')
        kabekCaseFilename = Utils.camelToKabeb(filename)
        keypath = realpath.join('.')
        // 读取文件
        const fileInfo = this.getFileToPath(i18nFilepath, filename, keypath, mode)
        i18nFilepath = fileInfo.i18nFilepath
        file = fileInfo.file
        selectWriteI18nPath = fileInfo.selectWriteI18nPath
      } else {
        file = this.readFile(i18nFilepath, true)
      }
      console.log({ file, keypath, key, i18nFilepath })
     
      // 尝试读取短横线命名格式的文件
      if (isEmpty(file) && Config.filenameToKebabCase && mode === MatchMode.READ) {
        i18nFilepath = path.join(
          lngItem.filepath,
          `${kabekCaseFilename}${this.fileExt}`
        )
        file = this.readFile(i18nFilepath, true)
      }
      return {
        ...lngItem,
        id: Math.random().toString(36).substr(-6),
        key,
        keypath,
        filepath: i18nFilepath,
        text: keypath ? get(file, keypath) : file,
        selectWriteI18nPath
      }
    })
  }

  getFileToPath(filePath, filename, keypath ,mode) {
    try {
      const pattern = `${filePath}\\${filename}/*${this.fileExt}`
      let result:Array<any> = []
      let file
      let i18nFilepath
      let selectWriteI18nPath
      const defaultPath = path.join(filePath, `${filename ? filename + '\\' : ''}index${this.fileExt}`)
      result = fg.sync(pattern, {
        onlyFiles: true
      })

      if (mode === MatchMode.FIND) {
        i18nFilepath = defaultPath
        file = this.readFile(defaultPath, true)
      } else if (mode === MatchMode.ADD) {
        // 新增确定路径逻辑
        const path = this.findAllI18n(result, keypath)
        if (!path.i18nFilepath && result.length === 1) {
          i18nFilepath = result[0]
        } else {
          selectWriteI18nPath = this.selectWriteI18nPath(result)
        }
      } else {
        const i18nItem = this.findAllI18n(result, keypath)
        i18nFilepath = i18nItem.i18nFilepath
        file = i18nItem.file
      }
      
      return { i18nFilepath: i18nFilepath || filePath, file: file || {}, selectWriteI18nPath }
    } catch (error) {
      Log.error(error)
      return { i18nFilepath: filePath, file: {} }
    }
    
  }

  findAllI18n(result, keypath){
    const index = result.findIndex(item => item.indexOf(`index${this.fileExt}`) > -1)
    const indexFilePath = index > -1 ? result.splice(index, 1) : []
    let file,i18nFilepath
    if (result.length > 0) {
      for (let i = 0; i < result.length; i++) {
        const item = result[i];
        file = this.readFile(item, true)
        if (keypath in file) {
          i18nFilepath = item
          break
        }
      }
    } else {
      file = this.readFile(indexFilePath[0], true)
      i18nFilepath = indexFilePath[0]
    }
    return {i18nFilepath, file}
  }

  selectWriteI18nPath(result) {
    const paths = result
    return function () {
      return vscode.window.showQuickPick(paths, {
        placeHolder: '请选择你要写入的文件',
        // onDidSelectItem: item => i18nFilepath = item
      })
    }
  }

  writeI18n(transData: ITransData[], mode: MatchMode = MatchMode.WRITE): Promise<any> {
    const writePromise = transData.map(({ filepath, keypath, text }) => {
      return new Promise((resolve, reject) => {
        const file = this.readFile(filepath, true)
        mode = mode !== MatchMode.ADD && !(keypath in file) ? MatchMode.ADD : mode //不存在的属性进行新增
        set(file, keypath, text)
        fs.writeFile(filepath, this.dataStringify(filepath, keypath, false, text, mode), err => {
          if (err) {
            return reject(err)
          }

          resolve('')
        })
      })
    })

    return Promise.all(writePromise)
  }
}
