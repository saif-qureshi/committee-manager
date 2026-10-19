import { View, type ViewProps } from 'react-native';

export function Card({ className = '', ...props }: ViewProps) {
  return (
    <View
      {...props}
      className={`rounded-card border border-line bg-surface p-5 ${className}`}
    />
  );
}
