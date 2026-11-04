/**
 * Shared rule-matching logic for transaction rules.
 * Guards against ReDoS by rejecting overly long or dangerous regex patterns.
 */
export function matchesRule(value: string, matchType: string, matchValue: string): boolean {
    const lowerValue = value.toLowerCase();
    const lowerMatch = matchValue.toLowerCase();

    switch (matchType) {
        case 'equals':
            return lowerValue === lowerMatch;
        case 'contains':
            return lowerValue.includes(lowerMatch);
        case 'startsWith':
            return lowerValue.startsWith(lowerMatch);
        case 'endsWith':
            return lowerValue.endsWith(lowerMatch);
        case 'regex':
            try {
                // ReDoS protection: reject overly long or dangerous patterns
                if (matchValue.length > 200) return false;
                // Detect nested quantifiers like (a+)+, (a*)* and repeated quantifiers like **
                if (/([+*])\1|(\([^)]*[+*][^)]*\))[+*]|([+*?}])\s*\)\s*[+*?{]/.test(matchValue)) return false;
                const regex = new RegExp(matchValue, 'i');
                return regex.test(value);
            } catch {
                return false;
            }
        default:
            return false;
    }
}

/** The fields of a stored `TransactionRule` that decide whether it matches. */
export interface MatchableRule {
    matchField: string;
    matchType: string;
    matchValue: string;
}

/** The parts of a transaction a rule can match against. `amount` is in dollars. */
export interface RuleSubject {
    payee?: string | null;
    memo?: string | null;
    amount: number;
}

/**
 * The first rule that matches `subject`, or undefined.
 * Pass `rules` already sorted by priority, highest first.
 */
export function findMatchingRule<T extends MatchableRule>(rules: readonly T[], subject: RuleSubject): T | undefined {
    return rules.find(rule => {
        const value =
            rule.matchField === 'payee' ? subject.payee ?? '' :
            rule.matchField === 'memo' ? subject.memo ?? '' :
            rule.matchField === 'amount' ? String(subject.amount) :
            null;
        return value !== null && matchesRule(value, rule.matchType, rule.matchValue);
    });
}
