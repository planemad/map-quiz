<style>
	div {
		z-index: 2;
		width: 40%;
		position: absolute;
	}
	@media (max-width: 1000px) {
		div {
			width: 100%;
			top: 60%;
		}
	}

</style>

<div>
	<slot></slot>
</div>