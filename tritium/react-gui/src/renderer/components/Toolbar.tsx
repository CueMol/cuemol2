import React from "react";
import { Button, ButtonGroup, Divider, Navbar, Alignment } from "@blueprintjs/core";

interface ToolbarProps {
  onOpenFile: () => void;
  onNewTab: () => void;
  onSave: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onOpenFile, onNewTab, onSave }) => {
  return (
    <Navbar className="app-toolbar" fixedToTop={false}>
      <Navbar.Group align={Alignment.LEFT}>
        <Navbar.Heading className="brand">
          <span className="brand-icon">⬡</span>
          <span className="brand-text">CueMol</span>
        </Navbar.Heading>
        <Navbar.Divider />

        <ButtonGroup minimal>
          <Button icon="document-open" text="Open" onClick={onOpenFile} />
          <Button icon="floppy-disk" text="Save" onClick={onSave} />
        </ButtonGroup>

        <Divider />

        <ButtonGroup minimal>
          <Button icon="undo" text="Undo" />
          <Button icon="redo" text="Redo" />
        </ButtonGroup>

        <Divider />

        <ButtonGroup minimal>
          <Button icon="film" text="New Scene" />
          <Button icon="cube-add" text="Load Mol" onClick={onOpenFile} />
          <Button icon="style" text="Renderer" />
        </ButtonGroup>

        <Divider />

        <ButtonGroup minimal>
          <Button icon="eye-open" text="View" />
          <Button icon="camera" text="Snapshot" />
        </ButtonGroup>

        <Divider />

        <ButtonGroup minimal>
          <Button icon="play" text="Run" />
          <Button icon="console" text="Log" />
          <Button icon="add" text="New Tab" onClick={onNewTab} />
        </ButtonGroup>
      </Navbar.Group>
    </Navbar>
  );
};
