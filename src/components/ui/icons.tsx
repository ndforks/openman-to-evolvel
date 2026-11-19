// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Icons of the app, from lucide-react (24 px grid) behind one set of props. A couple of trivial glyphs (play,
 * spinner) are drawn here. All inherit `currentColor`; size them with the `size` prop.
 */
import {
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  Bell,
  BookOpen,
  Cable,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  CircleHelp,
  Cloud,
  Ellipsis,
  FileText,
  Folder,
  FolderPlus,
  Gamepad2,
  HandHeart,
  House,
  Image,
  Laptop,
  LayoutGrid,
  LibraryBig,
  List,
  ListFilter,
  ListTodo,
  LogOut,
  Mail,
  MessageCircle,
  MessageCircleMore,
  MessagesSquare,
  Mic,
  Monitor,
  MonitorSmartphone,
  MousePointerClick,
  Package,
  PanelLeft,
  PanelsTopLeft,
  Paperclip,
  Plus,
  Presentation,
  Puzzle,
  Search,
  Settings2,
  Shapes,
  SlidersHorizontal,
  Smartphone,
  Sparkle,
  Sparkles,
  SquarePen,
  SquarePlay,
  Table,
  Telescope,
  User,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Width and height in px. */
  size?: number;
}

export type IconComponent = (props: IconProps) => ReactNode;

interface IconOptions {
  strokeWidth?: number;
  viewBox?: string;
  defaultSize?: number;
}

function createIcon(name: string, content: ReactNode, options: IconOptions = {}): IconComponent {
  const { strokeWidth: defaultStroke = 1.7, viewBox = "0 0 24 24", defaultSize = 18 } = options;
  function Icon({ size = defaultSize, strokeWidth = defaultStroke, style, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        style={{ flexShrink: 0, ...style }}
        {...rest}
      >
        {content}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

/** A lucide icon behind the same props as the drawn ones. */
function fromLucide(name: string, Glyph: LucideIcon, defaultSize = 18, defaultStroke = 2): IconComponent {
  function Icon({ size = defaultSize, strokeWidth = defaultStroke, style, ...rest }: IconProps) {
    return <Glyph size={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" style={{ flexShrink: 0, ...style }} {...rest} />;
  }
  Icon.displayName = name;
  return Icon;
}

/* Shell */
export const SearchIcon = fromLucide("SearchIcon", Search);
export const SidebarIcon = fromLucide("SidebarIcon", PanelLeft);
export const NewTaskIcon = fromLucide("NewTaskIcon", SquarePen);
export const ComputerIcon = fromLucide("ComputerIcon", Monitor);
export const LibraryIcon = fromLucide("LibraryIcon", LibraryBig);
export const AgentsIcon = fromLucide("AgentsIcon", MessagesSquare);
export const WebsiteIcon = fromLucide("WebsiteIcon", PanelsTopLeft, 18, 2);
export const AutomationIcon = fromLucide("AutomationIcon", Workflow, 18, 2);
export const PluginsIcon = fromLucide("PluginsIcon", LayoutGrid, 18, 2);
export const MoreIcon = fromLucide("MoreIcon", Ellipsis);
export const NewProjectIcon = fromLucide("NewProjectIcon", FolderPlus);
export const TaskIcon = fromLucide("TaskIcon", MessageCircle, 18, 1.7);
export const SparkleIcon = fromLucide("SparkleIcon", Sparkles, 18, 1.6);
export const SparkleSingleIcon = fromLucide("SparkleSingleIcon", Sparkle, 18, 1.7);
export const HandshakeIcon = fromLucide("HandshakeIcon", HandHeart);
export const DevicesIcon = fromLucide("DevicesIcon", MonitorSmartphone, 18, 1.6);
export const BellIcon = fromLucide("BellIcon", Bell, 18, 1.6);

export const ListFilterIcon = fromLucide("ListFilterIcon", ListFilter);
export const FolderIcon = fromLucide("FolderIcon", Folder);
export const ListTodoIcon = fromLucide("ListTodoIcon", ListTodo);

/* Arrows and marks */
export const ChevronUpIcon = fromLucide("ChevronUpIcon", ChevronUp, 14);
export const ChevronRightIcon = fromLucide("ChevronRightIcon", ChevronRight, 14);
export const ChevronDownIcon = fromLucide("ChevronDownIcon", ChevronDown, 14);
export const ChevronsUpDownIcon = fromLucide("ChevronsUpDownIcon", ChevronsUpDown, 14);
export const CheckIcon = fromLucide("CheckIcon", Check);
export const CloseIcon = fromLucide("CloseIcon", X, 14);
export const PlusIcon = fromLucide("PlusIcon", Plus, 16);
export const ArrowUpIcon = fromLucide("ArrowUpIcon", ArrowUp, 15);
export const ExternalArrowIcon = fromLucide("ExternalArrowIcon", ArrowUpRight, 12);

/* Composer */
export const CloudIcon = fromLucide("CloudIcon", Cloud, 16);
export const LaptopIcon = fromLucide("LaptopIcon", Laptop, 20, 1.6);
export const SlidersIcon = fromLucide("SlidersIcon", SlidersHorizontal, 22, 1.6);
export const ProjectBoxIcon = fromLucide("ProjectBoxIcon", Package, 16, 1.7);
export const ConnectorsIcon = fromLucide("ConnectorsIcon", Cable, 16);
export const ChatModeIcon = fromLucide("ChatModeIcon", MessageCircleMore, 18, 1.7);
export const MicIcon = fromLucide("MicIcon", Mic);
export const PaperclipIcon = fromLucide("PaperclipIcon", Paperclip, 14);
export const PuzzleIcon = fromLucide("PuzzleIcon", Puzzle, 14, 1.7);
export const ListIcon = fromLucide("ListIcon", List, 14, 1.7);
export const PhoneIcon = fromLucide("PhoneIcon", Smartphone, 14, 1.7);
export const MailIcon = fromLucide("MailIcon", Mail, 14, 1.7);

/* Quick actions */
export const SlidesIcon = fromLucide("SlidesIcon", Presentation, 22, 1.7);
export const TelescopeIcon = fromLucide("TelescopeIcon", Telescope, 22, 1.7);
export const VideoIcon = fromLucide("VideoIcon", SquarePlay, 22, 1.7);
export const GamepadIcon = fromLucide("GamepadIcon", Gamepad2, 16, 1.7);
export const ImageIcon = fromLucide("ImageIcon", Image, 16, 1.7);
export const TableIcon = fromLucide("TableIcon", Table, 16, 1.7);
export const ChartIcon = fromLucide("ChartIcon", ChartColumn, 16, 1.7);
export const AudioIcon = fromLucide("AudioIcon", AudioLines, 16, 1.7);
export const DocumentIcon = fromLucide("DocumentIcon", FileText, 16, 1.7);

/* Menus */
export const ComputerUseIcon = fromLucide("ComputerUseIcon", MousePointerClick, 14, 1.7);
export const PersonalizationIcon = fromLucide("PersonalizationIcon", Shapes, 14, 1.7);
export const UserIcon = fromLucide("UserIcon", User, 15, 1.7);
export const SettingsIcon = fromLucide("SettingsIcon", Settings2, 15, 1.7);
export const HomeIcon = fromLucide("HomeIcon", House, 15, 1.7);
export const HelpIcon = fromLucide("HelpIcon", CircleHelp, 15, 1.7);
export const BookIcon = fromLucide("BookIcon", BookOpen, 15, 1.7);
export const SignOutIcon = fromLucide("SignOutIcon", LogOut, 15, 1.7);
export const PlayIcon = createIcon("PlayIcon", <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />, { defaultSize: 28 });
export const SpinnerIcon = createIcon("SpinnerIcon", <path d="M12 3a9 9 0 1 0 9 9" />, { strokeWidth: 2, defaultSize: 16 });
