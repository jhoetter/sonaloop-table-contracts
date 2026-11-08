import { contractHash } from '../hash.ts';
import { account } from './account.ts';
import { campaign } from './campaign.ts';
import { consent } from './consent.ts';
import { contact } from './contact.ts';
import { contentItem } from './content-item.ts';
import { mediaAsset } from './media-asset.ts';

export { account, campaign, consent, contact, contentItem, mediaAsset };

/** The standard contracts v1: shared by many apps, part of this package, not of any platform. Ids carry no namespace. */
export const standard = Object.freeze({ contact, account, consent, contentItem, mediaAsset, campaign });

/** One entry of the list of standard contracts (`listStandardContracts`). */
export interface StandardContractEntry {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly purpose: string;
  readonly columns: number;
  readonly hash: string;
}

/** The standard contracts, sorted by id, with version, title, purpose, number of columns and hash. Use a standard contract before a table of your own. */
export function listStandardContracts(): StandardContractEntry[] {
  return Object.values(standard)
    .map(contract => ({ id: contract.id, version: contract.version, title: contract.title, purpose: contract.purpose, columns: contract.columns.length, hash: contractHash(contract) }))
    .sort((left, right) => (left.id < right.id ? -1 : 1));
}
