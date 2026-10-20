export const inputClass = (invalid: boolean) =>
  `mt-1 block w-full rounded-md shadow-sm ${
    invalid
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
  }`;
