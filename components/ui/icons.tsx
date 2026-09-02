import {
  Star,
  Tag,
  Salad,
  Pizza,
  Croissant,
  Wheat,
  Flame,
  Beef,
  Drumstick,
  Sandwich,
  Fish,
  Leaf,
  Soup,
  CupSoda,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/** Maps a Category.icon string to a lucide component (no dynamic imports). */
const map: Record<string, LucideIcon> = {
  Star,
  Tag,
  Salad,
  Pizza,
  Croissant,
  Wheat,
  Flame,
  Beef,
  Drumstick,
  Sandwich,
  Fish,
  Leaf,
  Soup,
  CupSoda,
};

export function CategoryIcon({
  name,
  className,
}: {
  name: string | null;
  className?: string;
}) {
  const Icon = (name && map[name]) || Utensils;
  return <Icon className={className} aria-hidden />;
}
