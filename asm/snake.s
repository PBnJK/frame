# SNAKE
# For the FRAME fantasy console
#
# Start date: 2025-07-22 20:30
# End date:   xxxx-xx-xx xx:xx

# Memory
#   $:00  snake position x
#   $:01  snake position y
#   $:02  snake direction x
#   $:03  snake direction y
#   $:04  apple position x
#   $:05  apple position y
#   $:06  game state
#   $:07  snake length
#   $:08  snake array start
#
# Menu Logic
#   TODO
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
#
# Lose Logic
#   TODO
#
# Win Logic
#   TODO
#

.addr 0x0200

# == GLOBAL DEFINES ==

.def SNAKE_POS_X 0x00
.def SNAKE_POS_Y 0x01
.def SNAKE_DIR_X 0x02
.def SNAKE_DIR_Y 0x03
.def APPLE_POS_X 0x04
.def APPLE_POS_Y 0x05
.def GAME_STATE 0x06
.def SNAKE_LEN 0x07
.def SNAKE_ARR 0x08

# == LFSR ==

.def LFSR_MASK 0x2d

# 16-bit LFSR seed, picked at random
@lfsr_seed_lsb .byte 0xbe
@lfsr_seed_msb .byte 0x97

# lfsr_gen
# Generates a random 8-bit number
# The output is stored in $8
#
# Based on
#   https://en.wikipedia.org/wiki/Linear-feedback_shift_register#Galois_LFSRs
#   https://www.nesdev.org/wiki/Random_number_generator#Linear_feedback_shift_register
#
# Uses register $f
@lfsr_gen
  mov $f, $0             # Loop index
  mov $8, @lfsr_seed_lsb # Initialize with seed

  @_lfsr_gen_loop
    lsh $8               # Left-shift the LFSR
	rol @lfsr_seed_msb   # Rotate seed MSB left
    chy                  # Check for carry (rol output)
	brf @_lfsr_gen_skip  # If bit was 0, skip XOR
	xor $8, LFSR_MASK    # XOR LFSR with mask

  @_lfsr_gen_skip
    inc $f               # Tick index
	equ $f, 8            # Have we completed 8 iterations?
    brf @_lfsr_gen_loop  # If not, loop back

  mov @lfsr_seed_lsb, $8 # Update LFSR start state
  ret

# == INIT ==

# init_snake
# Initializes the snake
@init_snake
  mov SNAKE_POS_X, $0
  mov SNAKE_POS_Y, $0
  mov SNAKE_DIR_X, 1
  mov SNAKE_DIR_Y, $0
  ret

# init
# Initializes the game
@init
  sei $0

  mov %fffc, @<irq # Setup IRQ handler LSB
  mov %fffd, @>irq # Setup IRQ handler MSB
  call @init_snake

  sei
  ret

# main
# Entry point
@main
  call @init
  mov $1, $0
@main_loop
  equ $1, $0
  brt @main_loop
  call @lfsr_gen
  jmp @main_loop
@exit_game
  hlt

@irq
  mov $1, 1
  ret
