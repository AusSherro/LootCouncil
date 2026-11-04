interface AccountOption {
    id: string;
}

export function getLastTransactionAccountKey(profileId: string): string {
    return `loot-council-last-transaction-account-${profileId}`;
}

export function resolveTransactionAccountId(
    accounts: AccountOption[],
    ...preferredAccountIds: Array<string | null | undefined>
): string {
    const availableAccountIds = new Set(accounts.map(account => account.id));
    return preferredAccountIds.find(accountId => accountId && availableAccountIds.has(accountId))
        ?? accounts[0]?.id
        ?? '';
}