import {
  ConnectionAuth,
  IO,
  IOTask,
  IntegrationTaskKey,
  Json,
  RunTaskErrorCallback,
  RunTaskOptions,
  TriggerIntegration,
  retry,
} from "@trigger.dev/sdk";
import { zbd as ZBDClient } from "@zbd/node";
import type {
  SendLightningAddressPaymentDataResponseType,
  SendLightningAddressPaymentOptionsType,
} from "@zbd/node/dist/types";

export type ZBDIntegrationOptions = {
  id: string;
  apiKey?: string;
  apiBaseUrl?: string;
};

export type ZBDRunTask = InstanceType<typeof ZBD>["runTask"];

export class ZBD implements TriggerIntegration {
  // @internal
  private _options: ZBDIntegrationOptions;
  // @internal
  private _client?: ZBDClient;
  // @internal
  private _io?: IO;
  // @internal
  private _connectionKey?: string;

  constructor(private options: ZBDIntegrationOptions) {
    if (Object.keys(options).includes("apiKey") && !options.apiKey) {
      throw `Can't create ZBD integration (${options.id}) as apiKey was undefined`;
    }

    this._options = options;
  }

  get authSource() {
    return "LOCAL" as const;
  }

  cloneForRun(io: IO, connectionKey: string, auth?: ConnectionAuth) {
    const apiKey = this._options.apiKey ?? auth?.accessToken;

    if (!apiKey) {
      throw new Error(`Can't initialize ZBD integration (${this._options.id}) as apiKey was undefined`);
    }

    const zbd = new ZBD(this._options);
    zbd._io = io;
    zbd._connectionKey = connectionKey;
    zbd._client = new ZBDClient(apiKey, this._options.apiBaseUrl);
    return zbd;
  }

  get id() {
    return this.options.id;
  }

  get metadata() {
    return { id: "zbd", name: "ZBD" };
  }

  runTask<T, TResult extends Json<T> | void>(
    key: IntegrationTaskKey,
    callback: (client: ZBDClient, task: IOTask, io: IO) => Promise<TResult>,
    options?: RunTaskOptions,
    errorCallback?: RunTaskErrorCallback
  ): Promise<TResult> {
    if (!this._io) throw new Error("No IO");
    if (!this._connectionKey) throw new Error("No connection key");

    return this._io.runTask(
      key,
      (task, io) => {
        if (!this._client) throw new Error("No client");
        return callback(this._client, task, io);
      },
      {
        icon: "zbd",
        retry: retry.standardBackoff,
        ...(options ?? {}),
        connectionKey: this._connectionKey,
      },
      errorCallback
    );
  }

  sendLightningAddressPayment(
    key: IntegrationTaskKey,
    params: SendLightningAddressPaymentOptionsType
  ): Promise<SendLightningAddressPaymentDataResponseType> {
    return this.runTask(
      key,
      async (client) => client.sendLightningAddressPayment(params),
      {
        name: "Send Lightning Address Payment",
        params,
        icon: "zbd",
        properties: [
          {
            label: "Lightning Address",
            text: params.lnAddress,
          },
          {
            label: "Amount",
            text: params.amount,
          },
          ...(params.comment
            ? [
                {
                  label: "Comment",
                  text: params.comment,
                },
              ]
            : []),
          ...(params.internalId
            ? [
                {
                  label: "Internal ID",
                  text: params.internalId,
                },
              ]
            : []),
        ],
      }
    );
  }
}
