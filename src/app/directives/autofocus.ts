import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

@Directive({
  selector: '[appAutofocus]',
})
export class Autofocus {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      this.element.nativeElement.focus();
      this.element.nativeElement.select();
    });
  }
}
