import { useState } from 'react'


export default function AdvancedCompiler() {
  const [code, setCode] = useState('')
  const [output, setOutput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  const compileAndExecute = () => {
    setIsLoading(true)
    setHasError(false)
    setOutput('')

    try {
      setTimeout(() => {
        try {
          let result = ''
          let tac = ''
          const lines = code.split('\n').filter(line => line.trim() !== '')
          const variables: Record<string, any> = {}
          const types: Record<string, string> = {}
          const functions: Record<string, { params: string[], body: string[] }> = {}
          let tempCount = 0

          const getTemp = () => `t${tempCount++}`

          const evaluateExpression = (expr: string): any => {
            expr = expr.trim()
            while ((expr.match(/\(/g)?.length ?? 0) < (expr.match(/\)/g)?.length ?? 0)) {
              expr = expr.slice(0, -1)
            }

            const functionCallMatch = expr.match(/^([a-zA-Z_]\w*)\s*\((.*)\)$/)
            if (functionCallMatch) {
              const funcName = functionCallMatch[1]
              const args = functionCallMatch[2].split(',').map(arg => evaluateExpression(arg.trim()))

              if (!functions[funcName]) {
                throw new Error(`Function '${funcName}' is not defined`)
              }

              const func = functions[funcName]
              if (args.length !== func.params.length) {
                throw new Error(`Function '${funcName}' expects ${func.params.length} arguments`)
              }

              const originalVars = { ...variables }
              try {
                func.params.forEach((param, i) => {
                  variables[param] = args[i]
                })

                let funcResult: any = undefined
                for (let line of func.body) {
                  const trimmed = line.trim()
                  if (trimmed.startsWith('return ')) {
                    const returnExpr = trimmed.substring(7).trim()
                    funcResult = evaluateExpression(returnExpr)
                    break
                  } else {
                    executeLine(trimmed)
                  }
                }

                return funcResult
              } finally {
                Object.keys(variables).forEach(key => delete variables[key])
                Object.assign(variables, originalVars)
              }
            }

            Object.keys(variables).forEach(varName => {
              const value = variables[varName]
              const safeValue = typeof value === 'string' ? `"${value}"` : value
              expr = expr.replace(new RegExp(`\\b${varName}\\b`, 'g'), safeValue)
            })

            expr = expr.replace(/(\w+)\s*\+\+/g, '$1 = $1 + 1')
                       .replace(/(\w+)\s*--/g, '$1 = $1 - 1')

            try {
              const value = eval(expr)
              const tempVar = getTemp()
              tac += `${tempVar} = ${expr}\n`
              return value
            } catch {
              throw new Error(`Error evaluating expression: ${expr}`)
            }
          }

          const executeLine = (line: string) => {
            if (!line.trim().endsWith(';')) return

            const stripped = line.trim().slice(0, -1).trim()

            const declarationMatch = stripped.match(/^(int|double|bool|char)\s+([a-zA-Z_]\w*)\s*=\s*(.+)$/)
            if (declarationMatch) {
              const [, type, name, expr] = declarationMatch
              const value = evaluateExpression(expr)
              types[name] = type
              variables[name] = value
              tac += `${name} = ${expr}\n`
              return
            }

            if (/^[a-zA-Z_]\w*\s*=\s*.+$/.test(stripped)) {
              const [varName, expr] = stripped.split('=').map(s => s.trim())
              if (!types[varName]) {
                throw new Error(`Variable '${varName}' not declared`)
              }
              variables[varName] = evaluateExpression(expr)
              tac += `${varName} = ${expr}\n`
            } else if (/^print\s*\(?.*\)?$/.test(stripped)) {
              let content = stripped.replace(/^print\s*\(?\s*/, '').replace(/\s*\)?\s*$/, '')
              const evaluated = evaluateExpression(content)
              result += `${evaluated}\n`
              tac += `print ${content}\n`
            } else if (/^\w+\s*(\+\+|--)$/.test(stripped)) {
              const varName = stripped.match(/^(\w+)\s*(\+\+|--)/)?.[1]
              const op = stripped.includes('++') ? '+' : '-'
              variables[varName!] = evaluateExpression(`${varName} ${op} 1`)
              tac += `${varName} = ${varName} ${op} 1\n`
            } else {
              throw new Error(`Syntax error: ${stripped}`)
            }
          }

          const executeBlock = (startIdx: number, endIdx: number): number => {
            let idx = startIdx
            while (idx <= endIdx) {
              const line = lines[idx].trim()

              if (line === '') {
                idx++
                continue
              }

              if (/^function\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\{?$/.test(line)) {
                const funcMatch = line.match(/^function\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\{?$/)!
                const funcName = funcMatch[1]
                const params = funcMatch[2].split(',').map(p => p.trim()).filter(Boolean)

                let braceCount = 0, blockEnd = idx
                do {
                  const current = lines[blockEnd].trim()
                  if (current.includes('{')) braceCount++
                  if (current.includes('}')) braceCount--
                  blockEnd++
                } while (braceCount > 0 && blockEnd < lines.length)

                functions[funcName] = {
                  params,
                  body: lines.slice(idx + 1, blockEnd - 1)
                }

                tac += `function ${funcName}(${params.join(', ')})\n`
                idx = blockEnd
              }
              else if (/^if\s*\((.*)\)\s*\{?$/.test(line)) {
                const condition = line.match(/^if\s*\((.*)\)/)![1]
                const condResult = evaluateExpression(condition)

                let braceCount = 0, blockEnd = idx
                do {
                  const current = lines[blockEnd].trim()
                  if (current.includes('{')) braceCount++
                  if (current.includes('}')) braceCount--
                  blockEnd++
                } while (braceCount > 0 && blockEnd < lines.length)

                tac += `if ${condition} goto block_${blockEnd}\n`
                if (condResult) {
                  for (let i = idx + 1; i < blockEnd - 1; i++) {
                    executeLine(lines[i].trim())
                  }
                }

                idx = blockEnd
              }
              else if (/^while\s*\((.*)\)\s*\{?$/.test(line)) {
                const condition = line.match(/^while\s*\((.*)\)/)![1]

                let braceCount = 0, blockEnd = idx
                do {
                  const current = lines[blockEnd].trim()
                  if (current.includes('{')) braceCount++
                  if (current.includes('}')) braceCount--
                  blockEnd++
                } while (braceCount > 0 && blockEnd < lines.length)

                tac += `while ${condition}\n`
                while (evaluateExpression(condition)) {
                  for (let i = idx + 1; i < blockEnd - 1; i++) {
                    executeLine(lines[i].trim())
                  }
                }

                idx = blockEnd
              }
              else {
                executeLine(line)
                idx++
              }
            }
            return idx
          }

          let idx = 0
          while (idx < lines.length) {
            idx = executeBlock(idx, lines.length - 1)
          }

          setOutput(`${result}\n--- TAC ---\n${tac}`)
        } catch (error) {
          setHasError(true)
          setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
          setIsLoading(false)
        }
      }, 500)
    } catch (error) {
      setHasError(true)
      setOutput(`Error: ${error instanceof Error ? error.message : String(error)}`)
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      compileAndExecute()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">Advanced Compiler</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Input Code</label>
            <div className="relative">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full min-h-[300px] p-3 font-mono text-sm bg-gray-900 text-gray-100 border border-gray-700 rounded"
                placeholder={`Example:

int x = 5;
double y = 3.5;
print(x + y);

if (x % 2 == 0) {
  print("Even");
} else {
  print("Odd");
}

int i = 0;
while (i < 3) {
  print(i);
  i++;
}

function add(a, b) {
  return a + b;
}

int x = 5;
int y = 3;
int s=add(x, y);
print(s);

if (s % 2 == 0)
{
  print("Even");
}

int i = 0;
while (i < 3) {
  print(i);
  i++;
}

int n = -10;
print(n);`}
              />
              <div className="absolute top-2 right-2 bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs">
                CustomLang
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={compileAndExecute}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Compiling...' : 'Run'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Output</label>
            <pre className={`w-full min-h-[100px] p-3 font-mono text-sm ${hasError ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'} border border-gray-300 rounded`}>
              {output || (isLoading ? 'Running...' : 'No output yet.')}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
