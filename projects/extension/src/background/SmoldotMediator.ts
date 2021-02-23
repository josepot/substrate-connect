import { SmoldotClient } from 'smoldot';

export class SmoldotMediator {
  readonly name: string;
  readonly #smoldot: SmoldotClient;
  #id: number;

  constructor(name: string, smoldot: SmoldotClient) {
    this.name = name;
    this.#smoldot = smoldot;
    this.#id = 0;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  /* eslint-disable @typescript-eslint/explicit-module-boundary-types */
  sendRpcMessage(message: any): number {
    const nextID = ++this.#id;
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    message.id = nextID;
    this.#smoldot.send_json_rpc(JSON.stringify(message));
    return nextID;
  }
}
