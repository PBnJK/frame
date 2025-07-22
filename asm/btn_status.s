.addr 0x0200

@str_prompt
  .byte 't','y','p','e','!',0

@str_buttons
  .byte '<','v','^','>','A','B','S','M'

@init
  sei $0            # No interrupts
  mov %fffc, @<irq  # Set up IRQ (lo)
  mov %fffd, @>irq  # Set up IRQ (hi)
  call @ktxt_clear  # Clear the screen
  sei               # Allow interrupts
  ret

# Outputs button status to the screen
#   $4 : Button
@btn_status
  # Print button glyph
  mov $8, @str_buttons, $4
  call @ktxt_putch

  # Print space
  mov $8, ' '
  call @ktxt_putch

  mov $5, $2         # Copy input
  rsh $5, $4         # Shift input bit right
  and $5, 1          # Mask it
  mov $8, '0'        # Start with '0'
  equ $5, $0         # Is the key pressed?
  brt @_btn_status_f # If not, skip
  inc $8             # Set $8 to '1'
@_btn_status_f
  call @ktxt_putch # Draws the character
  
  # Print space
  mov $8, ' '
  call @ktxt_putch
  ret

@main
  call @init

  # Draw the prompt
  mov $8, @<str_prompt
  mov $9, @>str_prompt
  call @ktxt_print
@_loop
  equ $3, 0
  brt @_loop
  sei $0

  mov $2, %e700         # Read input
  mov $3, $0            # Clear update flag  
  mov $4, $0            # Button index
  mov %e7bf, 0b00001000 # Cursor to (0, 1)
  @st_loop
    call @btn_status # Print button status
    inc $4           # Tick index
    lss $4, 8        # Still in button range?
    brt @st_loop     # If so, loop
  sei
  jmp @_loop

@irq
  mov $3, 1
  ret
