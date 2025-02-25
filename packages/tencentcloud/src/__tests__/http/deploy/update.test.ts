import { join, sep } from 'path'
import { Provider } from '../../..'

jest.mock('child_process', function () {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return { execSync () {} }
})

jest.mock('cos-nodejs-sdk-v5', () => {
  return class Client {
    headBucket (params, callback) {
      console.log('mock.cos.headBucket', params)
      callback()
    }

    sliceUploadFile (params, callback) {
      console.log('mock.cos.sliceUploadFile', params)
      callback()
    }

    deleteObject (params, callback) {
      console.log('mock.cos.deleteObject', params)
      callback()
    }
  }
})

jest.mock('@faasjs/request', function () {
  return {
    request: async function (url, options): Promise<any> {
      console.log('mock.request', url, JSON.stringify(options))
      switch (options.headers['X-TC-Action']) {
        case 'DescribeServicesStatus':
          return Promise.resolve({
            body: {
              Response: {
                Result: {
                  ServiceSet: [
                    {
                      ServiceName: 'testing',
                      ServiceId: 'serviceId'
                    }
                  ]
                }
              }
            }
          })
        case 'ListNamespaces':
          return Promise.resolve({ body: { Response: { Namespaces: [{ Name: 'testing' }] } } })
        case 'GetFunction':
          return Promise.resolve({
            body: {
              Response: {
                Status: 'Active',
                Triggers: []
              }
            }
          })
        case 'UpdateFunctionCode':
        case 'UpdateFunctionConfiguration':
        case 'GetAlias':
        case 'UpdateAlias':
          return Promise.resolve({ body: { Response: {} } })
        case 'PublishVersion':
          return Promise.resolve({ body: { Response: { FunctionVersion: '1' } } })
        case 'ListTriggers':
          return Promise.resolve({ body: { Response: { Triggers: [{}] } } })
        case 'GetProvisionedConcurrencyConfig':
          return Promise.resolve({ body: { Response: { Allocated: [] } } })
        case 'DeleteTrigger':
          return Promise.resolve({ body: { Response: {} } })
        case 'DescribeApisStatus':
          return Promise.resolve({ body: { Response: { Result: { ApiIdStatusSet: [{ Path: '/' }] } } } })
        case 'DescribeApi':
          return Promise.resolve({
            body: {
              Response: {
                Result: {
                  ServiceType: 'SCF',
                  ServiceTimeout: 1800,
                  ServiceScfFunctionName: 'http',
                  ServiceScfFunctionNamespace: 'testing',
                  ServiceScfFunctionQualifier: 'testing',
                  RequestConfig: { Method: 'POST' }
                }
              }
            }
          })
        case 'ReleaseService':
          return Promise.resolve({ body: { Response: {} } })
        default:
          return Promise.resolve({ body: { Response: { Error: 'Unknown mock' } } })
      }
    }
  }
})

test('update', async function () {
  const tc = new Provider({
    appId: 'appId',
    secretId: 'secretId',
    secretKey: 'secretKey',
    region: 'region'
  })

  await tc.deploy('cloud_function', {
    root: __dirname,
    filename: join(__dirname, '..', '..', 'funcs', 'http.func.ts'),
    env: 'testing',
    name: 'http',
    version: 'version',
    tmp: join(__dirname, '..', 'tmp', 'first') + sep,
    config: {},
    dependencies: { '@faasjs/func': '*' }
  }, {
    name: 'http',
    provider: {
      type: '@faasjs/tencentcloud',
      name: 'tencentcloud'
    },
    config: {}
  })

  await tc.deploy('http', {
    root: __dirname,
    filename: join(__dirname, '..', '..', 'funcs', 'http.func.ts'),
    env: 'testing',
    name: 'http',
    version: 'version',
    tmp: join(__dirname, '..', 'tmp', 'first') + sep,
    dependencies: { '@faasjs/func': '*' },
    config: {}
  }, {
    name: 'http',
    provider: {
      type: '@faasjs/tencentcloud',
      name: 'tencentcloud',
      config: {
        secretId: 'secretId',
        secretKey: 'secretKey',
        region: 'region'
      }
    },
    config: { path: '/' }
  })

  expect(true).toBeTruthy()
})
