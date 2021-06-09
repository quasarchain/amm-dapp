import { AbstractConnectorArguments, ConnectorUpdate } from '@web3-react/types'
import { AbstractConnector } from '@web3-react/abstract-connector'
import warning from 'tiny-warning'

import { SendReturnResult, SendReturn, Send, SendOld } from './types'

function parseSendReturn(sendReturn: SendReturnResult | SendReturn): any {
  return sendReturn.hasOwnProperty('result') ? sendReturn.result : sendReturn
}

export class NoBscProviderError extends Error {
  public constructor() {
    super()
    this.name = this.constructor.name
    this.message = 'No QUASAR provider was found on window.QuasarChain.'
  }
}

export class UserRejectedRequestError extends Error {
  public constructor() {
    super()
    this.name = this.constructor.name
    this.message = 'The user rejected the request.'
  }
}

export class BscConnector extends AbstractConnector {
  constructor(kwargs: AbstractConnectorArguments) {
    super(kwargs)

    this.handleNetworkChanged = this.handleNetworkChanged.bind(this)
    this.handleChainChanged = this.handleChainChanged.bind(this)
    this.handleAccountsChanged = this.handleAccountsChanged.bind(this)
    this.handleClose = this.handleClose.bind(this)
  }

  private handleChainChanged(chainId: string | number): void {
    this.emitUpdate({ chainId, provider: window.QuasarChain })
  }

  private handleAccountsChanged(accounts: string[]): void {
    if (accounts.length === 0) {
      this.emitDeactivate()
    } else {
      this.emitUpdate({ account: accounts[0] })
    }
  }

  private handleClose(): void {
    this.emitDeactivate()
  }

  private handleNetworkChanged(networkId: string | number): void {
    this.emitUpdate({ chainId: networkId, provider: window.QuasarChain })
  }

  public async activate(): Promise<ConnectorUpdate> {
    if (!window.QuasarChain) {
      throw new NoBscProviderError()
    }

    if (window.QuasarChain.on) {
      window.QuasarChain.on('chainChanged', this.handleChainChanged)
      window.QuasarChain.on('accountsChanged', this.handleAccountsChanged)
      window.QuasarChain.on('close', this.handleClose)
      window.QuasarChain.on('networkChanged', this.handleNetworkChanged)
    }

    if ((window.QuasarChain as any).isMetaMask) {
      ;(window.QuasarChain as any).autoRefreshOnNetworkChange = false
    }

    // try to activate + get account via eth_requestAccounts
    let account
    try {
      account = await (window.QuasarChain.send as Send)('eth_requestAccounts').then(
        sendReturn => parseSendReturn(sendReturn)[0]
      )
    } catch (error) {
      if ((error as any).code === 4001) {
        throw new UserRejectedRequestError()
      }
      warning(false, 'eth_requestAccounts was unsuccessful, falling back to enable')
    }

    // if unsuccessful, try enable
    if (!account) {
      // if enable is successful but doesn't return accounts, fall back to getAccount (not happy i have to do this...)
      account = await window.QuasarChain.enable().then(sendReturn => sendReturn && parseSendReturn(sendReturn)[0])
    }

    return { provider: window.QuasarChain, ...(account ? { account } : {}) }
  }

  public async getProvider(): Promise<any> {
    return window.QuasarChain
  }

  public async getChainId(): Promise<number | string> {
    if (!window.QuasarChain) {
      throw new NoBscProviderError()
    }

    let chainId
    try {
      chainId = await (window.QuasarChain.send as Send)('eth_chainId').then(parseSendReturn)
    } catch {
      warning(false, 'eth_chainId was unsuccessful, falling back to net_version')
    }

    if (!chainId) {
      try {
        chainId = await (window.QuasarChain.send as Send)('net_version').then(parseSendReturn)
      } catch {
        warning(false, 'net_version was unsuccessful, falling back to net version v2')
      }
    }

    if (!chainId) {
      try {
        chainId = parseSendReturn((window.QuasarChain.send as SendOld)({ method: 'net_version' }))
      } catch {
        warning(false, 'net_version v2 was unsuccessful, falling back to manual matches and static properties')
      }
    }

    if (!chainId) {
      if ((window.QuasarChain as any).isDapper) {
        chainId = parseSendReturn((window.QuasarChain as any).cachedResults.net_version)
      } else {
        chainId =
          (window.QuasarChain as any).chainId ||
          (window.QuasarChain as any).netVersion ||
          (window.QuasarChain as any).networkVersion ||
          (window.QuasarChain as any)._chainId
      }
    }

    return chainId
  }

  public async getAccount(): Promise<null | string> {
    if (!window.QuasarChain) {
      throw new NoBscProviderError()
    }

    let account
    try {
      account = await (window.QuasarChain.send as Send)('eth_accounts').then(
        sendReturn => parseSendReturn(sendReturn)[0]
      )
    } catch {
      warning(false, 'eth_accounts was unsuccessful, falling back to enable')
    }

    if (!account) {
      try {
        account = await window.QuasarChain.enable().then(sendReturn => parseSendReturn(sendReturn)[0])
      } catch {
        warning(false, 'enable was unsuccessful, falling back to eth_accounts v2')
      }
    }

    if (!account) {
      account = parseSendReturn((window.QuasarChain.send as SendOld)({ method: 'eth_accounts' }))[0]
    }

    return account
  }

  public deactivate() {
    if (window.QuasarChain && window.QuasarChain.removeListener) {
      window.QuasarChain.removeListener('chainChanged', this.handleChainChanged)
      window.QuasarChain.removeListener('accountsChanged', this.handleAccountsChanged)
      window.QuasarChain.removeListener('close', this.handleClose)
      window.QuasarChain.removeListener('networkChanged', this.handleNetworkChanged)
    }
  }

  public async isAuthorized(): Promise<boolean> {
    if (!window.QuasarChain) {
      return false
    }

    try {
      return await (window.QuasarChain.send as Send)('eth_accounts').then(sendReturn => {
        if (parseSendReturn(sendReturn).length > 0) {
          return true
        } else {
          return false
        }
      })
    } catch {
      return false
    }
  }
}