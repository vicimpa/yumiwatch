import type { FunctionalComponent as FC } from 'preact';

import { ButtonLink } from './Button';
import { Icon } from './Icon';

export type TSectionHeadingProps = {
  title: string;
  subtitle?: string;
  href?: string;
  action?: string;
};

export const SectionHeading: FC<TSectionHeadingProps> = ({
  title,
  subtitle,
  href,
  action = 'Смотреть всё',
}) => (
  <div class="section-heading">
    <div>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {href && (
      <ButtonLink href={href} variant="text">
        {action}
        <Icon name="arrow" size={17} />
      </ButtonLink>
    )}
  </div>
);
