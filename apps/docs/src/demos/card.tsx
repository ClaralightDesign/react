import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
} from "@claralight-design/react";

/**
 * The three card surfaces map onto the ClaraLight layer stack.
 *
 * `panel` sits on the window background, `control` sits inside a panel, and
 * `frost` floats over arbitrary content with a backdrop blur. Preview them over
 * the grid to see that the fills are translucent rather than painted.
 */
export function CardDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Panel</CardTitle>
          <CardDescription>The default surface, sitting on the window.</CardDescription>
        </CardHeader>
        <CardContent className="text-callout text-foreground-secondary">
          Titles outrank the rows they contain, so the heading uses the headline step rather than
          the title step.
        </CardContent>
        <CardFooter>
          <Button size="sm" variant="primary">
            Save
          </Button>
          <Button size="sm" variant="ghost">
            Cancel
          </Button>
        </CardFooter>
      </Card>

      <Card variant="frost">
        <CardHeader>
          <CardTitle>Frost</CardTitle>
          <CardDescription>Floats over content, with a backdrop blur.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Input size="sm" placeholder="Over a blur" />
        </CardContent>
      </Card>

      {/* Layout classes go on the wrapper: that is what the grid lays out. */}
      <Card variant="control" wrapperClassName="sm:col-span-2">
        <CardContent className="flex items-center gap-3 pt-4">
          <div className="flex-1 text-callout text-foreground-secondary">
            A <code className="font-mono text-mono">control</code> surface is meant to live inside a
            panel, where a translucent fill still reads as raised.
          </div>
          <Button size="sm">Action</Button>
        </CardContent>
      </Card>
    </div>
  );
}
