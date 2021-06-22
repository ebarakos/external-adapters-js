import { Requester, Validator, AdapterError } from '@chainlink/ea-bootstrap'
import { ExecuteWithConfig } from '@chainlink/types'
import { LCDClient, MnemonicKey, MsgExecuteContract, isTxError } from '@terra-money/terra.js'
import { Config, DEFAULT_GAS_PRICES } from '../config'

interface SubmitMsg {
  submit: {
    round_id: string
    submission: string
  }
}

export const NAME = 'fluxmonitor'

const customParams = {
  address: ['address'],
  roundId: ['round_id'],
  result: ['result'],
}

export const execute: ExecuteWithConfig<Config> = async (request, config) => {
  const validator = new Validator(request, customParams)
  if (validator.error) throw validator.error

  const jobRunID = validator.validated.id
  const address = validator.validated.data.address
  const roundId = validator.validated.data.roundId
  // TODO: temporary hack; multiply by precision either by sending it from the EI or fetching from the contract
  const result = (Number.parseFloat(validator.validated.data.result) * 1e3).toString()

  const terra = new LCDClient({
    URL: config.fcdUrl,
    chainID: config.chainId,
    gasPrices: { uluna: config.gasPrices || DEFAULT_GAS_PRICES },
  })

  const wallet = terra.wallet(new MnemonicKey({ mnemonic: config.mnemonic }))

  const submitMsg: SubmitMsg = {
    submit: {
      round_id: roundId,
      submission: result,
    },
  }
  const execMsg = new MsgExecuteContract(wallet.key.accAddress, address, submitMsg)

  try {
    const tx = await wallet.createAndSignTx({
      msgs: [execMsg],
    })
    const result = await terra.tx.broadcast(tx)

    if (isTxError(result)) {
      throw new Error(result.raw_log)
    }

    return Requester.success(
      jobRunID,
      {
        data: { txhash: result.txhash },
        status: 200,
      },
      true,
    )
  } catch (error) {
    throw new AdapterError({
      jobRunID,
      message: error.toString(),
      statusCode: 400,
    })
  }
}
