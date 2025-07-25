# SNAKE
# For the FRAME fantasy console
#
# Start date: 2025-07-22 20:30
# End date:   xxxx-xx-xx xx:xx

# Memory
#   $:00  snake position x
#   $:01  snake position y
#   $:02  snake direction
#   $:03  apple position x
#   $:04  apple position y
#   $:05  snake length
#   $:06  snake array start
#
# Game Logic
#   If Pressing Left Then
#     Set SNAKE_DIR_X -1
#     Set SNAKE_DIR_Y 0
#   Elif Pressing Up Then
#     Set SNAKE_DIR_X 0
#     Set SNAKE_DIR_Y -1
#   Elif Pressing Down Then
#     Set SNAKE_DIR_X 0
#     Set SNAKE_DIR_Y 1
#   Elif Pressing Right Then
#     Set SNAKE_DIR_X 1
#     Set SNAKE_DIR_Y 0
#   End
#
#   Move
#     TODO
#
#   If SNAKE_POS == APPLE_POS Then (snake head overlaps apple)
#     Add Snake Section            (increase length, append to array)
#     If SNAKE_LEN == 64 Then      (length is maximum tiles on screen)
#       Win                        (switch to win state)
#     End
#   End

.def SNAKE_HEAD_CHAR 'S'
.def SNAKE_BODY_CHAR 's'
.def APPLE_CHAR '@'

.def BUTTON_LEFT  0x1
.def BUTTON_DOWN  0x2
.def BUTTON_UP    0x4
.def BUTTON_RIGHT 0x8
.def BUTTON_A     0x10
.def BUTTON_B     0x20
.def BUTTON_START 0x40
.def BUTTON_MENU  0x80

.def SNAKE_VALID_HORZ  0x6 # BUTTON_UP   | BUTTON_DOWN
.def SNAKE_VALID_VERT  0x9 # BUTTON_LEFT | BUTTON_RIGHT

.def GAME_STATE_PLAY 0x0
.def GAME_STATE_LOSE 0x1

@snake_pos_x .byte 0
@snake_pos_y .byte 0
@snake_dir   .byte BUTTON_RIGHT
@snake_ndir  .byte BUTTON_RIGHT
@game_state  .byte GAME_STATE_PLAY
@apple_pos_x .byte 4
@apple_pos_y .byte 4

.addr 0x0200

# == STRINGS ==
@str_gameover
  .byte 'G', 'A', 'M', 'E', 'O', 'V', 'E', 'R', 0

# == LFSR ==

.def LFSR_MASK 0x2d

# 16-bit LFSR starting seed, picked at random
@lfsr_seed_lsb .byte 0xbf
@lfsr_seed_msb .byte 0x1a

# lfsr_gen
# Generates a random 8-bit number
# The output is stored in $8
#
# Based on
#   https://en.wikipedia.org/wiki/Linear-feedback_shift_register#Galois_LFSRs
#   https://www.nesdev.org/wiki/Random_number_generator#Linear_feedback_shift_register
@lfsr_gen
  push $f
  mov $f, $0             # Loop index
  mov $8, @lfsr_seed_lsb # Initialize with seed

  @_lfsr_gen_loop
    lsh $8               # Left-shift the LFSR LSB
	rol @lfsr_seed_msb   # Rotate LFSR MSB left
    chy                  # Check for carry (rol output)
	brf @_lfsr_gen_skip  # If the shifted-out bit was 0, skip XOR
	xor $8, LFSR_MASK    # XOR LFSR LSB with mask

  @_lfsr_gen_skip
    inc $f               # Tick index
	equ $f, 8            # Have we completed 8 iterations?
    brf @_lfsr_gen_loop  # If not, loop back

  mov @lfsr_seed_lsb, $8 # Update LFSR start state
  pop $f
  ret

# == INIT ==

# init_irq
# Initializes the IRQ handler
@init_irq
  sei $0           # Prevent interrupts
  mov %fffc, @<irq # Setup IRQ handler LSB
  mov %fffd, @>irq # Setup IRQ handler MSB
  ret

# == SNAKE ==

# update_snake
# Updates the snake
@update_snake
  mov $3, @snake_dir      # Load snake direction

  mov $1, %e700           # Read input
  and $1, 0b1111          # Mask direction keys
  brt @_update_snake_move # If zero, don't bother

  # Is pressing left?
  and $2, $1, BUTTON_LEFT
  brf @_update_snake_horz

  # Is pressing right?
  and $2, $1, BUTTON_RIGHT
  brf @_update_snake_horz

  # Is pressing up?
  and $2, $1, BUTTON_UP
  brf @_update_snake_vert

  # Is pressing down?
  and $2, $1, BUTTON_DOWN
  brf @_update_snake_vert

  # Should never happen, but if the check fails,
  # default to using the old direction
  jmp @_update_snake_move

  @_update_snake_horz
    and $1, $3, SNAKE_VALID_HORZ # AND with valid directions
    brt @_update_snake_move      # Give up
    jmp @_update_snake_dir
  @_update_snake_vert
    and $1, $3, SNAKE_VALID_VERT # AND with valid directions
    brt @_update_snake_move      # Give up
    # Fallthrough to @_update_snake_dir
  
  @_update_snake_dir
    mov $3, $2
    mov @snake_dir, $2

  @_update_snake_move
    equ $3, BUTTON_DOWN
    brt @_update_snake_move_d
    equ $3, BUTTON_UP
    brt @_update_snake_move_u
    equ $3, BUTTON_RIGHT
    brt @_update_snake_move_r
    # Fallthrough to @_update_snake_move_l

  @_update_snake_move_l
    dec @snake_pos_x
    jmp @_update_snake_check_dead

  @_update_snake_move_r
    inc @snake_pos_x
    jmp @_update_snake_check_dead

  @_update_snake_move_u
    dec @snake_pos_y
    jmp @_update_snake_check_dead

  @_update_snake_move_d
    inc @snake_pos_y
    # Fallthrough to @_update_snake_check_dead

  @_update_snake_check_dead
    mov $3, @snake_pos_x
    lss $3, 0x8            # Is X within the bounds?
    brf @_update_snake_die # If not, die
    mov $3, @snake_pos_y
    lss $3, 0x8            # Is Y within the bounds?
    brf @_update_snake_die # If not, die
    jmp @_update_snake_collide

  @_update_snake_die
    sei $0
    mov $8, GAME_STATE_LOSE
    mov @game_state, $8
    call @ktxt_clear
    mov $8, $0
    call @ktxt_move_x
    call @ktxt_move_y
    mov $8, @<str_gameover
    mov $9, @>str_gameover
    call @ktxt_print
    ret

  @_update_snake_collide

  ret

# draw_snake
# Draws the snake
@draw_snake
  mov $8, @snake_pos_x
  call @ktxt_move_x
  mov $8, @snake_pos_y
  call @ktxt_move_y
  mov $8, SNAKE_HEAD_CHAR
  call @ktxt_putch
  ret

# draw_apple
# Draws the apple
@draw_apple
  mov $8, @apple_pos_x
  call @ktxt_move_x
  mov $8, @apple_pos_y
  call @ktxt_move_y
  mov $8, APPLE_CHAR
  call @ktxt_putch
  ret

# init
# Initializes the game
@init
  call @init_irq
  call @ktxt_clear
  sei # Restore interrupts
  ret

# main
# Entry point
@main
  call @init
  mov $7, $0              # Initialize "update" register
@main_loop
  equ $7, $0              # Do we need an update?
  brt @main_loop          # If not, loop
  sei $0                  # No interrupts
  mov $7, $0              # Reset "update" register
  call @update_snake      # Update the snake
  equ $8, GAME_STATE_LOSE # Did we lose (@update_snake leaves state on $8)
  brt @lose_loop          # If so, jump to loser loop
  sei                     # Allow interrupts
  jmp @main_loop          # Restart loop...
@lose_loop
  jmp @lose_loop

@irq
  push $8             # Save $8
  mov $8, @game_state # Get game state
  equ $8, $0          # Is in LOSE state? (GAME_STATE_LOSE)
  brf @_irq_f         # If so, exit

  call @lfsr_gen   # Tick the RNG

  # Draw everything
  call @ktxt_clear
  call @draw_snake
  call @draw_apple

  mov $7, 1        # Request update
@_irq_f
  pop $8           # Restore $8
  ret
