type Variant = 'green' | 'red' | 'yellow' | 'blue' | 'gray';

interface BadgeProps {
  children: React.ReactNode;
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  gray: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
};

export function Badge({ children, variant = 'gray' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}
