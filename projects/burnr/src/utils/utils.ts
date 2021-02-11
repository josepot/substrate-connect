import { Account, LocalStorageAccountCtx } from './types';
import { uniqueNamesGenerator, Config, starWars } from 'unique-names-generator';
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/api';

const config: Config = {
	dictionaries: [starWars]
}

export const getName = (account: Account): string => `${account.name}`;

export const openInNewTab = (url: string): void => {
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer')
    if (newWindow) newWindow.opener = null
}

export const downloadFile = (fileName: string, data: string, type: string): void => {
    const anchor = window.document.createElement('a');
    anchor.href = window.URL.createObjectURL(
        new Blob(
            [data],
            { type: `application/${type}` }
        )
    );
    anchor.download = `${type === 'txt' ? 'seedphrase-' : ''}${fileName}.${type}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(anchor.href);
  }

  export const createLocalStorageAccount = (): LocalStorageAccountCtx => {
    const mnemonic = mnemonicGenerate(12);
    const keyring = new Keyring();
    const pair = keyring.addFromMnemonic(mnemonic, { name: uniqueNamesGenerator(config) }, 'sr25519');
    // const pair = keyring.addFromUri('//Charlie', { name: 'Charlie default' });
    return {
        userAddress: pair.address,
        userName: pair.meta.name as string || '____ _____',
        userSeed: mnemonic,
        userJson: pair.toJson(),
        userHistory: []
    }
  }

export  const isEmpty = (obj: any): boolean => (Object.keys(obj).length === 0 && obj.constructor === Object)

