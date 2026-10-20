import { useNavigate as useRouterNavigate, type NavigateOptions, type To } from 'react-router-dom';
import { useLocale } from '@/hooks/useLocale';
import { localizeTo } from '@/lib/localizedTo';

export function useNavigate() {
  const navigate = useRouterNavigate();
  const { path } = useLocale();
  return (to: To | number, options?: NavigateOptions) => typeof to === 'number' ? navigate(to) : navigate(localizeTo(to, path), options);
}
