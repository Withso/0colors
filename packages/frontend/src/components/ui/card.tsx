import * as React from "react";

import "./card.css";

function Card({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      {...props}
    />
  );
}

function CardHeader({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      {...props}
    />
  );
}

function CardTitle({ ...props }: React.ComponentProps<"div">) {
  return (
    <h4
      data-slot="card-title"
      {...props}
    />
  );
}

function CardDescription({ ...props }: React.ComponentProps<"div">) {
  return (
    <p
      data-slot="card-description"
      {...props}
    />
  );
}

function CardAction({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      {...props}
    />
  );
}

function CardContent({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      {...props}
    />
  );
}

function CardFooter({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
