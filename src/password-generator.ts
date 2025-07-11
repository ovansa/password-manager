import { UserSettings } from './types';

export class PasswordGenerator {
	private static readonly CHARACTER_SETS = {
		lowercase: 'abcdefghijklmnopqrstuvwxyz',
		uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
		numbers: '0123456789',
		symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
		similar: 'il1Lo0O',
	};

	static generate(settings: UserSettings['passwordGenerator']): string {
		let charset = '';

		if (settings.includeLowercase) {
			charset += this.CHARACTER_SETS.lowercase;
		}

		if (settings.includeUppercase) {
			charset += this.CHARACTER_SETS.uppercase;
		}

		if (settings.includeNumbers) {
			charset += this.CHARACTER_SETS.numbers;
		}

		if (settings.includeSymbols) {
			charset += this.CHARACTER_SETS.symbols;
		}

		if (settings.excludeSimilar) {
			charset = charset
				.split('')
				.filter((char) => !this.CHARACTER_SETS.similar.includes(char))
				.join('');
		}

		if (charset.length === 0) {
			throw new Error('No character sets selected for password generation');
		}

		let password = '';
		const array = new Uint32Array(settings.length);
		crypto.getRandomValues(array);

		for (let i = 0; i < settings.length; i++) {
			password += charset[array[i] % charset.length];
		}

		// Ensure password meets requirements
		if (settings.includeLowercase && !/[a-z]/.test(password)) {
			password = this.ensureCharacterType(
				password,
				this.CHARACTER_SETS.lowercase,
				settings.excludeSimilar
			);
		}

		if (settings.includeUppercase && !/[A-Z]/.test(password)) {
			password = this.ensureCharacterType(
				password,
				this.CHARACTER_SETS.uppercase,
				settings.excludeSimilar
			);
		}

		if (settings.includeNumbers && !/[0-9]/.test(password)) {
			password = this.ensureCharacterType(
				password,
				this.CHARACTER_SETS.numbers,
				settings.excludeSimilar
			);
		}

		if (
			settings.includeSymbols &&
			!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)
		) {
			password = this.ensureCharacterType(
				password,
				this.CHARACTER_SETS.symbols,
				settings.excludeSimilar
			);
		}

		return password;
	}

	private static ensureCharacterType(
		password: string,
		charset: string,
		excludeSimilar: boolean
	): string {
		let availableChars = charset;

		if (excludeSimilar) {
			availableChars = charset
				.split('')
				.filter((char) => !this.CHARACTER_SETS.similar.includes(char))
				.join('');
		}

		if (availableChars.length === 0) {
			return password;
		}

		const randomIndex = Math.floor(Math.random() * password.length);
		const randomChar =
			availableChars[Math.floor(Math.random() * availableChars.length)];

		return (
			password.substring(0, randomIndex) +
			randomChar +
			password.substring(randomIndex + 1)
		);
	}

	static calculateStrength(password: string): {
		score: number;
		feedback: string[];
		label: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
	} {
		let score = 0;
		const feedback: string[] = [];

		// Length check
		if (password.length >= 12) {
			score += 2;
		} else if (password.length >= 8) {
			score += 1;
		} else {
			feedback.push('Use at least 8 characters');
		}

		// Character variety
		if (/[a-z]/.test(password)) score += 1;
		else feedback.push('Add lowercase letters');

		if (/[A-Z]/.test(password)) score += 1;
		else feedback.push('Add uppercase letters');

		if (/[0-9]/.test(password)) score += 1;
		else feedback.push('Add numbers');

		if (/[^a-zA-Z0-9]/.test(password)) score += 1;
		else feedback.push('Add symbols');

		// Common patterns penalty
		if (/(.)\1{2,}/.test(password)) {
			score -= 1;
			feedback.push('Avoid repeated characters');
		}

		if (/123|abc|qwe|password|admin/i.test(password)) {
			score -= 2;
			feedback.push('Avoid common patterns');
		}

		// Determine label
		let label: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
		if (score >= 6) label = 'Strong';
		else if (score >= 4) label = 'Good';
		else if (score >= 2) label = 'Fair';
		else if (score >= 1) label = 'Weak';
		else label = 'Very Weak';

		return {
			score: Math.max(0, Math.min(5, score)),
			feedback,
			label,
		};
	}

	static generatePassphrase(wordCount: number = 4): string {
		const words = [
			'apple',
			'banana',
			'cherry',
			'dragon',
			'elephant',
			'forest',
			'guitar',
			'honey',
			'island',
			'jungle',
			'kitten',
			'lemon',
			'mountain',
			'ocean',
			'piano',
			'queen',
			'river',
			'sunset',
			'tiger',
			'umbrella',
			'violet',
			'water',
			'yellow',
			'zebra',
			'bridge',
			'castle',
			'desert',
			'eagle',
			'flower',
			'garden',
			'horse',
			'iceberg',
			'jewel',
			'knight',
			'lighthouse',
			'meadow',
			'north',
			'oasis',
			'palace',
			'quartz',
			'rainbow',
			'storm',
			'thunder',
			'universe',
			'valley',
			'wizard',
			'crystal',
			'dream',
		];

		const selectedWords: string[] = [];
		const usedIndices = new Set<number>();

		while (selectedWords.length < wordCount) {
			const randomIndex = Math.floor(Math.random() * words.length);
			if (!usedIndices.has(randomIndex)) {
				usedIndices.add(randomIndex);
				selectedWords.push(words[randomIndex]);
			}
		}

		return selectedWords.join('-');
	}
}

export const passwordGenerator = PasswordGenerator;
