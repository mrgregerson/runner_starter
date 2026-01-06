import Phaser from "phaser";

const WIDTH = 720;
const HEIGHT = 720;

const BASE_SPEED = 360;
const MAX_SPEED = 900; // cap so difficulty doesn't become impossible

// Ground setup (less dead space)
const GROUND_HEIGHT = 180;
const GROUND_Y = HEIGHT - GROUND_HEIGHT; // surface line

// Physics (base)
const GRAVITY_Y_BASE = 1800;
const JUMP_VEL_BASE = 720; // positive magnitude

// Slide timing (1.5x)
const SLIDE_MIN_MS = 330;          // keyboard hold minimum
const TOUCH_SLIDE_MS_BASE = 1500;  // swipe-down slide duration at start
const TOUCH_SLIDE_MS_MIN = 630;    // never shorter than this

class RunnerScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private ground!: Phaser.GameObjects.Rectangle;

  private obstacles!: Phaser.Physics.Arcade.Group;
  private speed = BASE_SPEED;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;

  private jumpKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;

  // Touch gesture state
  private touchStartX = 0;
  private touchStartY = 0;
  private touchGestureFired = false;

  private isSliding = false;
  private slideMinUntil = 0;

  private nextSpawnAt = 0;
  private gameIsOver = false;
  private hasStarted = false;

  // Overlay state (ONE system)
  private overlayItems: Phaser.GameObjects.GameObject[] = [];
  private panelTopY = 78; // panel starts below score area

  constructor() {
    super("RunnerScene");
  }

  create() {
    // Reset run state
    this.speed = BASE_SPEED;
    this.score = 0;
    this.isSliding = false;
    this.slideMinUntil = 0;
    this.gameIsOver = false;
    this.hasStarted = false;

    this.touchGestureFired = false;

    // Background
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x1a1a1a);

    // Keys
    this.sKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP).on("down", () => {
      if (!this.hasStarted) this.startGame();
      else this.tryJump();
    });

    // Ground
    this.ground = this.add.rectangle(
      WIDTH / 2,
      GROUND_Y + GROUND_HEIGHT / 2,
      WIDTH * 2,
      GROUND_HEIGHT,
      0x222222
    );
    this.physics.add.existing(this.ground, true);

    // Textures
    this.makeTextures();

    // Player
    this.player = this.physics.add.sprite(150, GROUND_Y, "player");
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    this.player.setGravityY(GRAVITY_Y_BASE);

    this.setPlayerHitboxStanding();
    this.physics.add.collider(this.player, this.ground as any);

    // Obstacles
    this.obstacles = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.physics.add.overlap(this.player, this.obstacles, () => this.gameOver(), undefined, this);

    // Score UI
    this.scoreText = this.add.text(18, 18, "Score: 0", {
      fontFamily: "system-ui, Arial",
      fontSize: "28px",
      color: "#f5e6b3",
    });

    this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);

    // Start screen: pause physics until start
    this.physics.pause();
    this.showStartOverlay();

    // Spawn timing
    this.nextSpawnAt = this.time.now + 900;

    // Mobile controls: swipe up = jump, swipe down = slide
    const SWIPE_Y_THRESHOLD = 55;
    const SWIPE_X_TOLERANCE = 80;

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.gameIsOver) return;

      // If not started, a tap starts the game
      if (!this.hasStarted) {
        this.startGame();
        return;
      }

      this.touchStartX = p.x;
      this.touchStartY = p.y;
      this.touchGestureFired = false;
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.gameIsOver) return;
      if (!this.hasStarted) return;
      if (!p.isDown) return;
      if (this.touchGestureFired) return;

      const dx = p.x - this.touchStartX;
      const dy = p.y - this.touchStartY;

      if (Math.abs(dx) > SWIPE_X_TOLERANCE && Math.abs(dx) > Math.abs(dy)) return;

      // Swipe down => slide
      if (dy > SWIPE_Y_THRESHOLD) {
        this.touchGestureFired = true;
        this.startSlideFor(this.time.now, this.getTouchSlideDurationMs());
        return;
      }

      // Swipe up => jump
      if (dy < -SWIPE_Y_THRESHOLD) {
        this.touchGestureFired = true;
        this.tryJump();
        return;
      }
    });

    this.input.on("pointerup", () => {
      this.touchGestureFired = false;
    });
  }

  update(time: number, delta: number) {
    if (this.gameIsOver) return;
    if (!this.hasStarted) return;

    // Speed ramp + cap
    this.speed = Math.min(MAX_SPEED, this.speed + delta * 0.015);

    // Scale gravity with speed so jump resolves faster later
    const f = this.getSpeedFactor();
    this.player.setGravityY(GRAVITY_Y_BASE * f);

    // Score
    this.score += (delta * this.speed) / 1000;
    this.scoreText.setText(`Score: ${Math.floor(this.score)}`);

    // Jump (space)
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) this.tryJump();

    // Slide: keyboard hold
    const slideHeld = this.downKey.isDown || this.sKey.isDown;
    if (slideHeld) this.startSlideFor(time, SLIDE_MIN_MS);
    else if (this.isSliding && time >= this.slideMinUntil) this.endSlide();

    // Spawn obstacles
    if (time >= this.nextSpawnAt) {
      this.spawnObstacle();

      const minGap = 560;
      const maxGap = 920;
      const gap = Phaser.Math.Clamp(
        920 - (this.speed - BASE_SPEED) * 0.8,
        minGap,
        maxGap
      );
      this.nextSpawnAt = time + gap;
    }

    // Move obstacles left
    this.obstacles.getChildren().forEach((o) => {
      const obs = o as Phaser.Physics.Arcade.Sprite;
      obs.x -= (this.speed * delta) / 1000;
      if (obs.x < -200) obs.destroy();
    });
  }

  private startGame() {
    if (this.hasStarted || this.gameIsOver) return;

    this.hasStarted = true;
    this.clearOverlay();

    // Reset run values cleanly
    this.speed = BASE_SPEED;
    this.score = 0;
    this.scoreText.setText("Score: 0");
    this.isSliding = false;
    this.slideMinUntil = 0;

    this.obstacles.clear(true, true);

    this.player.setVelocity(0, 0);
    this.player.y = GROUND_Y;
    this.setPlayerHitboxStanding();

    this.nextSpawnAt = this.time.now + 900;

    this.physics.resume();
  }

  private getSpeedFactor() {
    return Phaser.Math.Clamp(this.speed / BASE_SPEED, 1, MAX_SPEED / BASE_SPEED);
  }

  private getTouchSlideDurationMs() {
    const f = this.getSpeedFactor();
    const raw = TOUCH_SLIDE_MS_BASE * Math.pow(1 / f, 0.3);
    return Math.round(Phaser.Math.Clamp(raw, TOUCH_SLIDE_MS_MIN, TOUCH_SLIDE_MS_BASE));
  }

  private tryJump() {
    const onGround = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (!onGround) return;

    if (this.isSliding) this.endSlide();

    const f = this.getSpeedFactor();
    const jumpVel = -JUMP_VEL_BASE * Math.sqrt(f);
    this.player.setVelocityY(jumpVel);
  }

  private startSlideFor(time: number, durationMs: number) {
    const onGround = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (!onGround) return;

    if (!this.isSliding) {
      this.isSliding = true;
      this.setPlayerHitboxSliding();
    }

    this.slideMinUntil = Math.max(this.slideMinUntil, time + durationMs);
  }

  private endSlide() {
    this.isSliding = false;
    this.setPlayerHitboxStanding();
  }

  private spawnObstacle() {
    const type = Phaser.Math.Between(0, 1);

    if (type === 0) {
      // Hurdle (half size)
      const hurdle = this.physics.add.sprite(WIDTH + 120, GROUND_Y, "hurdle");
      hurdle.setOrigin(0.5, 1);
      hurdle.body.setSize(36, 31, true);
      hurdle.body.setOffset(2, 2);
      hurdle.setImmovable(true);
      hurdle.body.allowGravity = false;
      this.obstacles.add(hurdle);
    } else {
      // Bar (half length)
      const barBottomY = GROUND_Y - 105;
      const bar = this.physics.add.sprite(WIDTH + 120, barBottomY, "bar");
      bar.setOrigin(0.5, 1);
      bar.body.setSize(65, 26, true);
      bar.body.setOffset(2, 4);
      bar.setImmovable(true);
      bar.body.allowGravity = false;
      this.obstacles.add(bar);
    }
  }

  private showStartOverlay() {
    this.clearOverlay();
  
    const PANEL_W = 560;
    const PANEL_H = 260;
  
    const panelX = WIDTH / 2;
    const panelY = this.panelTopY + PANEL_H / 2;
  
    const panel = this.add.rectangle(panelX, panelY, PANEL_W, PANEL_H, 0x000000, 0.65);
    panel.setStrokeStyle(2, 0xf5e6b3, 1);
    panel.setDepth(1000);
  
    const titleText = this.add.text(panelX, this.panelTopY + 22, "ENDLESS RUNNER", {
      fontFamily: "system-ui, Arial",
      fontSize: "44px",
      color: "#f5e6b3",
    });
    titleText.setOrigin(0.5, 0);
    titleText.setDepth(1001);
  
    // --- Two-column layout ---
    const colY = this.panelTopY + 92;
    const colW = (PANEL_W - 80) / 2; // padding + gap
    const leftX = panelX - (colW / 2) - 20;
    const rightX = panelX + (colW / 2) + 20;
  
    const desktopText = this.add.text(
      leftX,
      colY,
      ["Desktop:", "• Space / ↑ = Jump", "• ↓ / S = Slide"].join("\n"),
      {
        fontFamily: "system-ui, Arial",
        fontSize: "18px",
        color: "#ffffff",
        align: "left",
        wordWrap: { width: colW },
        lineSpacing: 8,
      }
    );
    desktopText.setOrigin(0.5, 0);
    desktopText.setDepth(1001);
  
    const mobileText = this.add.text(
      rightX,
      colY,
      ["Mobile:", "• Swipe up = Jump", "• Swipe down = Slide"].join("\n"),
      {
        fontFamily: "system-ui, Arial",
        fontSize: "18px",
        color: "#ffffff",
        align: "left",
        wordWrap: { width: colW },
        lineSpacing: 8,
      }
    );
    mobileText.setOrigin(0.5, 0);
    mobileText.setDepth(1001);
  
    const hintText = this.add.text(panelX, this.panelTopY + PANEL_H - 36, "Tap or Swipe to Start", {
      fontFamily: "system-ui, Arial",
      fontSize: "18px",
      color: "#cccccc",
    });
    hintText.setOrigin(0.5, 0.5);
    hintText.setDepth(1001);
  
    this.overlayItems = [panel, titleText, desktopText, mobileText, hintText];
  }
  

  private gameOver() {
    if (this.gameIsOver) return;

    this.gameIsOver = true;
    this.physics.pause();

    this.showOverlay(
      "GAME OVER",
      `Score: ${Math.floor(this.score)}`,
      "Tap to Restart"
    );

    this.input.once("pointerdown", () => this.scene.restart());
    this.input.keyboard?.once("keydown", () => this.scene.restart());
  }

  private clearOverlay() {
    this.overlayItems.forEach((o) => o.destroy());
    this.overlayItems = [];
  }

  private showOverlay(title: string, body: string, hint: string) {
    this.clearOverlay();

    const PANEL_W = 560;
    const PANEL_H = 260;

    const panelX = WIDTH / 2;
    const panelY = this.panelTopY + PANEL_H / 2;

    const panel = this.add.rectangle(panelX, panelY, PANEL_W, PANEL_H, 0x000000, 0.65);
    panel.setStrokeStyle(2, 0xf5e6b3, 1);
    panel.setDepth(1000);

    const titleText = this.add.text(panelX, this.panelTopY + 22, title, {
      fontFamily: "system-ui, Arial",
      fontSize: "44px",
      color: "#f5e6b3",
    });
    titleText.setOrigin(0.5, 0);
    titleText.setDepth(1001);

    const bodyText = this.add.text(panelX, this.panelTopY + 88, body, {
      fontFamily: "system-ui, Arial",
      fontSize: "20px",
      color: "#ffffff",
      align: "center",
      lineSpacing: 10,
      wordWrap: { width: PANEL_W - 60 },
    });
    bodyText.setOrigin(0.5, 0);
    bodyText.setDepth(1001);

    const hintText = this.add.text(panelX, this.panelTopY + PANEL_H - 36, hint, {
      fontFamily: "system-ui, Arial",
      fontSize: "18px",
      color: "#cccccc",
    });
    hintText.setOrigin(0.5, 0.5);
    hintText.setDepth(1001);

    this.overlayItems = [panel, titleText, bodyText, hintText];
  }

  private makeTextures() {
    const g = this.add.graphics();

    // Player (half width, same height)
    g.fillStyle(0xf5e6b3, 1);
    g.fillRoundedRect(0, 0, 45, 120, 14);
    g.lineStyle(4, 0x8a6b3a, 1);
    g.strokeRoundedRect(0, 0, 45, 120, 14);
    g.generateTexture("player", 45, 120);
    g.clear();

    // Hurdle (half size)
    g.fillStyle(0xffaa33, 1);
    g.fillRect(0, 0, 40, 35);
    g.lineStyle(3, 0x6b3d00, 1);
    g.strokeRect(0, 0, 40, 35);
    g.generateTexture("hurdle", 40, 35);
    g.clear();

    // Bar (half length)
    g.fillStyle(0x66ccff, 1);
    g.fillRect(0, 0, 70, 34);
    g.lineStyle(4, 0x003f55, 1);
    g.strokeRect(0, 0, 70, 34);
    g.generateTexture("bar", 70, 34);

    g.destroy();
  }

  private setPlayerHitboxStanding() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Collider
    body.setSize(35, 110, true);
    body.setOffset((45 - 35) / 2, 120 - 110);

    // Visual cue
    this.tweens.add({
      targets: this.player,
      angle: 0,
      duration: 90,
      ease: "Sine.easeOut",
    });
    this.player.clearTint();
  }

  private setPlayerHitboxSliding() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Collider (keep feet anchored by using origin bottom, offset from bottom)
    body.setSize(42, 55, true);
    body.setOffset((45 - 42) / 2, 120 - 55);

    // Visual cue: tilt only (safe, doesn’t change physics)
    this.tweens.add({
      targets: this.player,
      angle: -45,
      duration: 80,
      ease: "Sine.easeOut",
    });
    this.player.setTint(0xdde8ff);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  parent: "app",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: [RunnerScene],
};

new Phaser.Game(config);
