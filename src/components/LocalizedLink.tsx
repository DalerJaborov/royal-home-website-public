import { Link as RouterLink, type LinkProps } from 'react-router-dom';
import { useLocale } from '@/hooks/useLocale';
import { localizeTo } from '@/lib/localizedTo';

export function Link(props: LinkProps) {
  const { path } = useLocale();
  return <RouterLink {...props} to={localizeTo(props.to, path)} />;
}
