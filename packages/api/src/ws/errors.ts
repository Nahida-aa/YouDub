export const appErrCode = {
	INTERNAL_ERROR: 'INTERNAL_ERROR',
	IO_ERROR: 'IO_ERROR',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
} as const;

export type AppErrCode = (typeof appErrCode)[keyof typeof appErrCode];

export class AppError<C extends AppErrCode> extends Error {
	constructor(
		public code: C,
		message: string,
		public details?: unknown,
	) {
		super(message);
		this.name = 'WsError';
	}

	toJSON(): {
		ok: false;
		error: { code: string; msg: string; details?: unknown };
	} {
		return {
			ok: false as const,
			error:
				this.details !== undefined
					? { code: this.code, msg: this.message, details: this.details }
					: { code: this.code, msg: this.message },
		};
	}
}

export type AppErr<C extends AppErrCode = AppErrCode, D = undefined> = {
	code: C;
	msg: string;
	details?: D;
};

export type RetErr<C extends AppErrCode = AppErrCode, D = undefined> = {
	ok: false;
	error: AppErr<C, D>;
};

export type Ret<
	T = undefined,
	C extends AppErrCode = AppErrCode,
	D = undefined,
> = T | RetErr<C, D>;

export const newErr = <C extends AppErrCode, D = undefined>(
	code: C,
	msg: string,
	details?: D,
): RetErr<C, D> => ({
	ok: false,
	error: details === undefined ? { code, msg } : { code, msg, details },
});
