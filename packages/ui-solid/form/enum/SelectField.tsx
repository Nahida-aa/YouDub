import { type ComponentProps, splitProps } from 'solid-js';
import {
	Select,
	SelectContent,
	SelectItem,
	type SelectProps,
	SelectTrigger,
	SelectValue,
} from '../../base/select';
import { FieldX } from '../comp';
import type { FieldBase, Options } from '../types';

export type SelectFieldProps<
	T extends { value: string; label: string } = { value: string; label: string },
> = FieldBase &
	Omit<SelectProps<T>, 'value' | 'options' | 'onChange'> & {
		value?: T;
		options: T[];
		onChange?: (o?: T | null) => void;
		class?: string;
	};

export const SelectField = <
	T extends { value: string; label: string } = { value: string; label: string },
>(
	props: SelectFieldProps<T>,
) => {
	const [local, others] = splitProps(props, [
		'invalid',
		'title',
		'required',
		'fieldId',
		'description',
		'errors',
	]);
	return (
		<FieldX {...local}>
			<Select
				// {...others}

				value={others.value}
				options={others.options}
				id={local.fieldId}
				aria-invalid={local.invalid}
				optionValue="value"
				optionTextValue="label"
				onChange={(o) => others.onChange?.(o)}
				itemComponent={(props) => (
					<SelectItem item={props.item}>{props.item.rawValue.label}</SelectItem>
				)}
			>
				<SelectTrigger class={others.class}>
					<SelectValue<T>>
						{(state) => state.selectedOption().label}
					</SelectValue>
				</SelectTrigger>
				<SelectContent />
			</Select>
		</FieldX>
	);
};
